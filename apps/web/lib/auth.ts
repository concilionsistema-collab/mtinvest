import type { UsuarioPerfil } from '@crm/shared';

const STORAGE_KEY = 'crm.auth.token';
// Fecha a pendência "sem refresh token" (README) — token opaco, nunca
// decodificado no navegador, só reenviado para /auth/refresh e /auth/logout.
const STORAGE_KEY_REFRESH = 'crm.auth.refreshToken';

export interface SessaoDecodificada {
  usuarioId: string;
  tenantId: string;
  unidadeId: string;
  perfil: UsuarioPerfil;
  expiraEm: number;
}

export function salvarToken(token: string): void {
  window.localStorage.setItem(STORAGE_KEY, token);
}

export function limparToken(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function obterToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function salvarRefreshToken(refreshToken: string): void {
  window.localStorage.setItem(STORAGE_KEY_REFRESH, refreshToken);
}

export function limparRefreshToken(): void {
  window.localStorage.removeItem(STORAGE_KEY_REFRESH);
}

export function obterRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY_REFRESH);
}

/**
 * Decodifica o payload do JWT no navegador SEM verificar assinatura — a
 * verificação de verdade é sempre feita pelo backend (JwtAuthGuard) em toda
 * chamada; isto aqui só lê claims públicas (tenantId/perfil/exp) para a UI
 * saber quem está logado e detectar expiração local, nunca para decidir
 * autorização de fato.
 */
export function decodificarToken(token: string): SessaoDecodificada | null {
  try {
    const [, payloadBase64] = token.split('.');
    const payload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
    return {
      usuarioId: payload.sub,
      tenantId: payload.tenantId,
      unidadeId: payload.unidadeId,
      perfil: payload.perfil,
      expiraEm: payload.exp * 1000,
    };
  } catch {
    return null;
  }
}

export function tokenExpirado(sessao: SessaoDecodificada): boolean {
  return Date.now() >= sessao.expiraEm;
}
