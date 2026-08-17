import { Controller, Get, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { IniciarCheckoutResultado, StatusAssinatura } from '@crm/shared';
import { Public } from '../../common/auth/public.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { SkipBillingCheck } from './skip-billing-check.decorator';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // @SkipBillingCheck(): um tenant já bloqueado por trial vencido/
  // inadimplência precisa continuar conseguindo ver o próprio status e
  // pagar - senão o bloqueio vira permanente sem saída.
  @SkipBillingCheck()
  @Get('status')
  status(@CurrentTenant() tenantId: string): Promise<StatusAssinatura> {
    return this.billingService.obterStatus(tenantId);
  }

  @SkipBillingCheck()
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  checkout(@CurrentTenant() tenantId: string, @CurrentUsuario() ator: UsuarioAutenticado): Promise<IniciarCheckoutResultado> {
    return this.billingService.iniciarCheckout(tenantId, ator);
  }

  // @Public(): quem chama é o Stripe, sem nenhum JWT nosso - a autenticação
  // real é a assinatura HMAC do corpo (ver BillingService.processarWebhook).
  // RawBodyRequest (habilitado via { rawBody: true } em create-app.ts) dá
  // acesso ao corpo EXATO recebido, sem re-serialização - a verificação de
  // assinatura da Stripe falha se um único byte mudar.
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') assinatura?: string,
  ): Promise<{ recebido: true }> {
    await this.billingService.processarWebhook(assinatura, request.rawBody ?? Buffer.from(''));
    return { recebido: true };
  }
}
