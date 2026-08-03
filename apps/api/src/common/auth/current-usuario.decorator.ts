import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { Request } from 'express';
import { UsuarioAutenticado } from './usuario-autenticado';

export const CurrentUsuario = createParamDecorator((_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.usuarioAutenticado) {
    // JwtAuthGuard deveria ter preenchido isso antes de qualquer controller rodar.
    throw new InternalServerErrorException('Contexto de autenticação ausente na requisição.');
  }
  return request.usuarioAutenticado;
});
