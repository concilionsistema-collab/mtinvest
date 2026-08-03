import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtPayload } from './jwt-payload.interface';

// US-002/US-003 (EPIC-01): substitui o TenantMiddleware placeholder.
// Verifica o JWT e, a cada requisição, reconsulta o status do usuário no
// banco (US-003, CA-001) - é assim que o bloqueio automático de usuário
// desligado acontece de fato: o token em si não é revogado (sem
// blacklist/sessão com estado neste MVP), mas fica inutilizável porque o
// guard nunca aceita um usuário que não esteja mais ATIVO.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extrairToken(request);
    if (!token) {
      throw new UnauthorizedException('Token de autenticação ausente.');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token de autenticação inválido ou expirado.');
    }

    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Token de autenticação inválido ou expirado.');
    }

    const usuario = await this.tenantPrisma.run(payload.tenantId, (tx) =>
      tx.usuario.findFirst({ where: { id: payload.sub, tenantId: payload.tenantId } }),
    );
    if (!usuario || usuario.status !== 'ATIVO') {
      throw new UnauthorizedException('Sessão inválida — usuário inativo ou desligado.');
    }

    request.usuarioAutenticado = {
      id: usuario.id,
      tenantId: usuario.tenantId,
      unidadeId: usuario.unidadeId,
      perfil: usuario.perfil,
    };
    return true;
  }
}

function extrairToken(request: Request): string | null {
  const cabecalho = request.header('authorization');
  if (!cabecalho?.startsWith('Bearer ')) {
    return null;
  }
  return cabecalho.slice('Bearer '.length);
}
