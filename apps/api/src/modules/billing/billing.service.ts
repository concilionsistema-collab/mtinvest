import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { IniciarCheckoutResultado, StatusAssinatura } from '@crm/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

// EXTENSAO REGISTRADA (onboarding self-service + cobranca, "bloqueador P0
// pra revenda" do README): antes desta fatia nao existia NENHUM jeito de
// cobrar um cliente pela propria plataforma - cada tenant era provisionado
// manualmente, sem cobranca nenhuma. Modelo escolhido (ver conversa com o
// usuario): por TENANT (nao por corretor/assento - evita ter que contar
// assentos), trial de 14 dias sem pedir cartao na entrada, self-service via
// Stripe Checkout.
//
// Stripe e opcional em runtime de proposito: se STRIPE_SECRET_KEY/
// STRIPE_PRICE_ID nao estiverem configurados (ambiente de quem ainda nao
// criou a conta Stripe), a API sobe normalmente e so os 2 endpoints que
// dependem disso respondem com erro claro - em vez de crashar a API inteira
// na subida (diferente de JWT_SECRET/DATABASE_URL, que sao realmente
// obrigatorios, ver create-app.ts).
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;

  constructor(private readonly prisma: PrismaService) {
    const chave = process.env.STRIPE_SECRET_KEY;
    this.stripe = chave ? new Stripe(chave) : null;
  }

  private get configurado(): boolean {
    return this.stripe !== null && Boolean(process.env.STRIPE_PRICE_ID);
  }

  async obterStatus(tenantId: string): Promise<StatusAssinatura> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const trialFimEm = tenant.trialFimEm;
    const diasRestantesTrial = tenant.assinaturaStatus === 'TRIAL' && trialFimEm
      ? Math.max(0, Math.ceil((trialFimEm.getTime() - Date.now()) / 86_400_000))
      : null;

    return {
      status: tenant.assinaturaStatus,
      trialFimEm: trialFimEm ? trialFimEm.toISOString() : null,
      diasRestantesTrial,
      cobrancaIndisponivel: !this.configurado,
    };
  }

  // So GESTOR_UNIDADE gerencia a assinatura do workspace - mesma logica de
  // "quem decide sobre a conta toda" ja usada em UsuariosService.criar (so
  // GESTOR_UNIDADE concede perfil).
  async iniciarCheckout(tenantId: string, ator: UsuarioAutenticado): Promise<IniciarCheckoutResultado> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Apenas o perfil "Gestor de unidade" pode gerenciar a assinatura.');
    }
    if (!this.stripe || !this.configurado) {
      throw new BadRequestException('Cobrança ainda não está configurada neste ambiente.');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    let stripeCustomerId = tenant.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        name: tenant.razaoSocial,
        metadata: { tenantId },
      });
      stripeCustomerId = customer.id;
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { stripeCustomerId } });
    }

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID as string, quantity: 1 }],
      success_url: `${appUrl}/configuracoes?checkout=sucesso`,
      cancel_url: `${appUrl}/configuracoes?checkout=cancelado`,
      // client_reference_id (checkout.session.completed) E metadata da
      // assinatura (fallback para eventos futuros, ex. invoice.payment_failed,
      // que so trazem o customer, nao a session original) - dois caminhos
      // pra sempre conseguir voltar do evento Stripe pro tenantId.
      client_reference_id: tenantId,
      subscription_data: { metadata: { tenantId } },
    });

    if (!session.url) {
      throw new BadRequestException('Não foi possível iniciar o checkout.');
    }
    return { url: session.url };
  }

  // Assinatura HMAC do PRÓPRIO CORPO (ver BillingController.webhook,
  // RawBodyRequest) é a única autenticação aqui - não tem JWT nosso, quem
  // chama é o Stripe. Sem isso qualquer um poderia forjar "paguei" batendo
  // direto nesta rota pública.
  async processarWebhook(assinatura: string | undefined, corpoRaw: Buffer): Promise<void> {
    const segredo = process.env.STRIPE_WEBHOOK_SECRET;
    if (!this.stripe || !segredo) {
      throw new BadRequestException('Webhook de cobrança não está configurado neste ambiente.');
    }
    if (!assinatura) {
      throw new BadRequestException('Assinatura do webhook ausente.');
    }

    let evento: Stripe.Event;
    try {
      evento = this.stripe.webhooks.constructEvent(corpoRaw, assinatura, segredo);
    } catch (erro) {
      this.logger.warn(`Webhook Stripe rejeitado: assinatura inválida (${(erro as Error).message}).`);
      throw new BadRequestException('Assinatura do webhook inválida.');
    }

    switch (evento.type) {
      case 'checkout.session.completed': {
        const sessao = evento.data.object as Stripe.Checkout.Session;
        const tenantId = sessao.client_reference_id;
        if (!tenantId) break;
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            assinaturaStatus: 'ATIVA',
            stripeCustomerId: idDe(sessao.customer),
            stripeSubscriptionId: idDe(sessao.subscription),
          },
        });
        break;
      }
      case 'invoice.paid': {
        // Cobranca recorrente confirmada - garante que sai de INADIMPLENTE
        // se tinha caido numa cobranca anterior (Stripe tenta de novo
        // automaticamente antes de cancelar de vez).
        const tenantId = await this.tenantIdPorCustomer((evento.data.object as Stripe.Invoice).customer);
        if (tenantId) await this.prisma.tenant.update({ where: { id: tenantId }, data: { assinaturaStatus: 'ATIVA' } });
        break;
      }
      case 'invoice.payment_failed': {
        const tenantId = await this.tenantIdPorCustomer((evento.data.object as Stripe.Invoice).customer);
        if (tenantId) await this.prisma.tenant.update({ where: { id: tenantId }, data: { assinaturaStatus: 'INADIMPLENTE' } });
        break;
      }
      case 'customer.subscription.deleted': {
        const tenantId = await this.tenantIdPorCustomer((evento.data.object as Stripe.Subscription).customer);
        if (tenantId) await this.prisma.tenant.update({ where: { id: tenantId }, data: { assinaturaStatus: 'CANCELADA' } });
        break;
      }
      default:
        // Outros eventos (ex.: atualizacao de cartao) nao mudam o status de
        // assinatura nesta fatia - ignorados de proposito, nao por descuido.
        break;
    }
  }

  private async tenantIdPorCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
    const customerId = idDe(customer);
    if (!customerId) return null;
    const tenant = await this.prisma.tenant.findFirst({ where: { stripeCustomerId: customerId } });
    return tenant?.id ?? null;
  }
}

function idDe(valor: string | { id: string } | null | undefined): string | undefined {
  if (!valor) return undefined;
  return typeof valor === 'string' ? valor : valor.id;
}
