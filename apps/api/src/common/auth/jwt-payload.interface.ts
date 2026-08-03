import { UsuarioPerfil } from '@crm/shared';

// `typ` distingue access token (aceito pelo JwtAuthGuard em qualquer rota
// protegida) de refresh token (só aceito por /auth/refresh e /auth/logout) -
// sem essa marcação, um refresh token vazado (validade de 30 dias) poderia
// ser usado diretamente como Authorization: Bearer, já que teria a mesma
// assinatura/claims válidas para o guard.
export type JwtTokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  unidadeId: string;
  perfil: UsuarioPerfil;
  typ: JwtTokenType;
}
