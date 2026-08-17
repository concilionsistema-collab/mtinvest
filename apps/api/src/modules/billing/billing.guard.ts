import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator';
import { SKIP_BILLING_CHECK_KEY } from './skip-billing-check.decorator';

// Guard GLOBAL (registrado via APP_GUARD em billing.module.ts, mesmo padrao
// de JwtAuthGuard em auth.module.ts): bloqueia toda rota autenticada quando
// a assinatura do tenant esta vencida (trial expirado sem checkout) ou
// inadimplente/cancelada - e o outro lado da moeda do onboarding
// self-service (TenantsService): sem isso, um trial nunca terminaria de
// verdade.
//
// Depende de request.usuarioAutenticado, que so existe DEPOIS que
// JwtAuthGuard roda - se este guard rodar antes (ordem de APP_GUARD entre
// modulos nao e 100% garantida pelo Nest), ele so deixa passar sem checar
// nada; JwtAuthGuard ainda rejeita a chamada de qualquer forma se nao
// houver token valido, entao o pior caso e "checagem de billing pulada
// numa unica requisicao", nunca um furo de autenticacao.
@Injectable()
export class BillingGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_BILLING_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = request.usuarioAutenticado?.tenantId;
    if (!tenantId) return true;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { assinaturaStatus: true, trialFimEm: true },
    });
    if (!tenant) return true;

    if (tenant.assinaturaStatus === 'ATIVA') return true;

    if (tenant.assinaturaStatus === 'TRIAL') {
      if (!tenant.trialFimEm || tenant.trialFimEm.getTime() > Date.now()) return true;
      throw new ForbiddenException('Seu período de teste terminou. Assine para continuar usando o sistema.');
    }

    // INADIMPLENTE ou CANCELADA
    throw new ForbiddenException('A assinatura deste workspace está inativa. Regularize o pagamento para continuar.');
  }
}
