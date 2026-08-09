import type { LoginResultado } from '@crm/shared';
import { limparRefreshToken, limparToken, obterRefreshToken, obterToken, salvarRefreshToken, salvarToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
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
    throw new ApiError(resposta.status, `Falha na chamada a ${path} (HTTP ${resposta.status}).`);
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
