import type { LoginResultado } from '@crm/shared';
import { limparRefreshToken, limparToken, obterRefreshToken, obterToken, salvarRefreshToken, salvarToken } from './auth';

// A origem local é fixa para impedir que chunks antigos apontem para túneis
// temporários. No domínio publicado, a URL continua vindo da configuração.
const API_URL = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:3001'
  : process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  /**
   * Mensagem de negócio devolvida pelo corpo da resposta (ex.: NestJS
   * BadRequestException tem { message: "..." }) - undefined quando o corpo
   * não é JSON ou não tem esse campo. Sem isso, o front-end só sabia dizer
   * "falhou" para QUALQUER rejeição da API, mesmo quando o backend já
   * explica exatamente o motivo (regra de negócio violada, permissão
   * faltando etc.) - obrigando cada tela a reinventar uma mensagem genérica
   * por conta própria.
   */
  constructor(public status: number, message: string, public backendMessage?: string) {
    super(message);
  }
}

async function extrairMensagemDoCorpo(resposta: Response): Promise<string | undefined> {
  try {
    // clone(): o corpo de uma Response só pode ser lido uma vez: sem clonar,
    // um chamador que também tentasse ler resposta.json()/text() depois
    // (ou o log de erro do navegador) veria o stream já consumido.
    const corpo = await resposta.clone().json();
    if (typeof corpo?.message === 'string') return corpo.message;
    if (Array.isArray(corpo?.message)) return corpo.message.join(' ');
  } catch {
    // Corpo ausente ou não é JSON (ex.: erro 5xx cru de infraestrutura) -
    // segue sem mensagem específica, o chamador cai no texto genérico.
  }
  return undefined;
}

// Deduplica renovações concorrentes: se várias chamadas de apiFetch levam
// 401 ao mesmo tempo (ex.: página que dispara Promise.all de vários
// endpoints), todas compartilham a MESMA chamada a /auth/refresh - o
// refresh token é de uso único (rotacionado no backend), então disparar
// mais de uma renovação em paralelo faria a segunda falhar por reuso.
let renovacaoEmAndamento: Promise<string | null> | null = null;

async function renovarSessao(): Promise<string | null> {
  const refreshToken = obterRefreshToken();
  if (!refreshToken) return null;

  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (resposta) => {
        if (!resposta.ok) {
          limparToken();
          limparRefreshToken();
          return null;
        }
        const resultado = (await resposta.json()) as LoginResultado;
        salvarToken(resultado.accessToken);
        salvarRefreshToken(resultado.refreshToken);
        return resultado.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        renovacaoEmAndamento = null;
      });
  }

  return renovacaoEmAndamento;
}

function requisitar(path: string, init: RequestInit | undefined, token: string | null): Promise<Response> {
  const isFormData = typeof window !== 'undefined' && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> || {}),
  };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });
}

async function paraResultado<T>(resposta: Response, path: string): Promise<T> {
  if (!resposta.ok) {
    throw new ApiError(resposta.status, `Falha na chamada a ${path} (HTTP ${resposta.status}).`, await extrairMensagemDoCorpo(resposta));
  }
  if (resposta.status === 204) {
    return undefined as T;
  }
  return (await resposta.json()) as T;
}

/**
 * Cliente HTTP fino para a API. Envia o JWT de sessão (US-002/US-003) via
 * Authorization: Bearer — o servidor deriva tenant/usuário/perfil do token
 * verificado, nunca de um valor enviado pelo cliente (ver JwtAuthGuard).
 *
 * Em 401 (access token expirado — dura só 1h, ver AuthService), tenta
 * renovar a sessão silenciosamente via refresh token e repete a chamada
 * original uma única vez antes de desistir - fecha a pendência "sem
 * refresh token" (README) também do lado do cliente, não só na API.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = obterToken();
  const resposta = await requisitar(path, init, token);

  if (resposta.status === 401) {
    const novoToken = await renovarSessao();
    if (novoToken) {
      const respostaRenovada = await requisitar(path, init, novoToken);
      return paraResultado<T>(respostaRenovada, path);
    }
  }

  return paraResultado<T>(resposta, path);
}

/**
 * Variante de apiFetch para recursos binários (ex.: foto de perfil,
 * GET /usuarios/:id/foto) — não dá pra usar uma <img src="..."> direto
 * porque a tag não envia o header Authorization, e essas rotas exigem
 * sessão como qualquer outra. O chamador monta um object URL a partir do
 * Blob (e chama URL.revokeObjectURL depois, pra não vazar memória).
 *
 * Retorna null em 404 (recurso ainda não existe, ex.: usuário sem foto) —
 * esse é um estado esperado, não uma falha a ser tratada como erro.
 */
export async function apiFetchBlob(path: string): Promise<Blob | null> {
  const token = obterToken();
  let resposta = await requisitar(path, undefined, token);

  if (resposta.status === 401) {
    const novoToken = await renovarSessao();
    if (novoToken) {
      resposta = await requisitar(path, undefined, novoToken);
    }
  }

  if (resposta.status === 404) {
    return null;
  }
  if (!resposta.ok) {
    throw new ApiError(resposta.status, `Falha na chamada a ${path} (HTTP ${resposta.status}).`, await extrairMensagemDoCorpo(resposta));
  }
  return resposta.blob();
}
