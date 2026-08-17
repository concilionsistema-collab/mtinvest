'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LoginInput, LoginResultado, UsuarioPerfil } from '@crm/shared';
import { ApiError } from '../lib/api';
import {
  decodificarToken,
  limparRefreshToken,
  limparToken,
  obterRefreshToken,
  obterToken,
  salvarRefreshToken,
  salvarToken,
  tokenExpirado,
} from '../lib/auth';

// Em desenvolvimento, nunca reaproveita no navegador um endpoint temporário
// gravado em cache por um build anterior. A prévia local sempre conversa com
// a API local; produção continua usando a variável configurada na Vercel.
const API_URL = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:3001'
  : process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface SessaoAtiva {
  tenantId: string;
  usuarioId: string;
  unidadeId: string;
  perfil: UsuarioPerfil;
}

interface AuthContextValue {
  sessao: SessaoAtiva | null;
  carregando: boolean;
  login: (input: LoginInput) => Promise<void>;
  /** POST /tenants (self-signup) já devolve accessToken/refreshToken/usuario prontos - evita logar de novo via /auth/login logo em seguida. */
  entrarComSessao: (resultado: LoginResultado) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** US-002/US-003 (ART-014, EPIC-01): substitui o TenantProvider placeholder por sessão JWT real. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoAtiva | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Fecha a pendência "sem refresh token" (README): antes, um access token
  // expirado ao reabrir o app forçava login de novo mesmo com uma "sessão"
  // ainda válida. Agora, se o access token salvo expirou (ou nunca existiu)
  // mas há um refresh token, tenta renovar silenciosamente antes de exigir
  // login - só cai em /login se a renovação também falhar (refresh token
  // ausente/expirado/revogado).
  useEffect(() => {
    async function restaurarSessao(): Promise<void> {
      const token = obterToken();
      if (token) {
        const decodificado = decodificarToken(token);
        if (decodificado && !tokenExpirado(decodificado)) {
          setSessao({
            tenantId: decodificado.tenantId,
            usuarioId: decodificado.usuarioId,
            unidadeId: decodificado.unidadeId,
            perfil: decodificado.perfil,
          });
          return;
        }
      }

      const refreshToken = obterRefreshToken();
      if (refreshToken) {
        try {
          const resposta = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (resposta.ok) {
            const resultado = (await resposta.json()) as LoginResultado;
            salvarToken(resultado.accessToken);
            salvarRefreshToken(resultado.refreshToken);
            setSessao({
              tenantId: resultado.usuario.tenantId,
              usuarioId: resultado.usuario.id,
              unidadeId: resultado.usuario.unidadeId,
              perfil: resultado.usuario.perfil,
            });
            return;
          }
        } catch {
          // rede indisponível - cai para o estado deslogado abaixo, sem travar a UI
        }
      }

      limparToken();
      limparRefreshToken();
    }

    restaurarSessao().finally(() => setCarregando(false));
  }, []);

  function entrarComSessao(resultado: LoginResultado): void {
    salvarToken(resultado.accessToken);
    salvarRefreshToken(resultado.refreshToken);
    setSessao({
      tenantId: resultado.usuario.tenantId,
      usuarioId: resultado.usuario.id,
      unidadeId: resultado.usuario.unidadeId,
      perfil: resultado.usuario.perfil,
    });
  }

  async function login(input: LoginInput): Promise<void> {
    const resposta = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resposta.ok) {
      throw new ApiError(resposta.status, 'E-mail, senha ou empresa inválidos.');
    }
    const resultado = (await resposta.json()) as LoginResultado;
    entrarComSessao(resultado);
  }

  function logout(): void {
    const refreshToken = obterRefreshToken();
    limparToken();
    limparRefreshToken();
    setSessao(null);
    if (refreshToken) {
      // Revogação best-effort: /auth/logout é silencioso/idempotente no
      // backend, e o front-end já limpou o estado local acima de qualquer
      // forma - não há nada útil a fazer com o resultado desta chamada.
      fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
  }

  return <AuthContext.Provider value={{ sessao, carregando, login, entrarComSessao, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  }
  return context;
}
