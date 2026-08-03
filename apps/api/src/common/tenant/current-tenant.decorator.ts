import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { Request } from 'express';

// US-002/US-003 (EPIC-01): tenantId agora vem do token JWT verificado pelo
// JwtAuthGuard (request.usuarioAutenticado), nunca mais de um header
// confiável pelo cliente (x-tenant-id) — ver common/auth/.
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.usuarioAutenticado) {
    // JwtAuthGuard deveria ter preenchido isso antes de qualquer controller rodar.
    throw new InternalServerErrorException('Contexto de tenant ausente na requisição.');
  }
  return request.usuarioAutenticado.tenantId;
});
