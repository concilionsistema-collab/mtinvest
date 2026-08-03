import { Usuario } from './usuario';

/**
 * US-002/US-003 (ART-014, EPIC-01) — autenticação real. `tenantId` é
 * digitado no login porque este sistema ainda não tem um mecanismo de
 * descoberta de tenant por e-mail (equivalente a "URL do workspace" em SaaS
 * B2B multi-tenant) — extensão consciente, não um substituto de SSO.
 */
export interface LoginInput {
  tenantId: string;
  email: string;
  senha: string;
}

export interface LoginResultado {
  accessToken: string;
  refreshToken: string;
  usuario: Usuario;
}

// Fecha a pendencia "sem refresh token" (README). O refresh token é opaco
// para o cliente (não decodificado no navegador, ao contrário do access
// token) - só é reenviado de volta para /auth/refresh e /auth/logout.
export interface RefreshTokenInput {
  refreshToken: string;
}
