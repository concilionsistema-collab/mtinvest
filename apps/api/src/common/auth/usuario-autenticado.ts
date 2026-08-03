import { UsuarioPerfil } from '@crm/shared';

/**
 * US-002/US-003 (EPIC-01): contexto do usuário autenticado, preenchido pelo
 * JwtAuthGuard a partir do token verificado — nunca de um header confiável
 * pelo cliente (substitui o antigo TenantMiddleware/x-tenant-id).
 */
export interface UsuarioAutenticado {
  id: string;
  tenantId: string;
  unidadeId: string;
  perfil: UsuarioPerfil;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuarioAutenticado?: UsuarioAutenticado;
  }
}
