/** Espelha a entidade Tenant de ART-005 (Modelo de Dados Nuclear), secao 3. */
export type TenantStatus = 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';

/**
 * EXTENSAO REGISTRADA (onboarding self-service + cobranca): status da
 * ASSINATURA (dinheiro), separado de TenantStatus (operacional). Ver
 * comentario completo em schema.prisma, enum TenantAssinaturaStatus.
 */
export type TenantAssinaturaStatus = 'TRIAL' | 'ATIVA' | 'INADIMPLENTE' | 'CANCELADA';

export interface Tenant {
  id: string;
  razaoSocial: string;
  status: TenantStatus;
  criadoEm: string;
}

/**
 * tenantId aqui e o IDENTIFICADOR escolhido pelo cliente no cadastro (slug,
 * ex.: "imobiliaria-silva"), nao um UUID gerado - e o mesmo valor que o
 * usuario vai digitar no campo "Empresa" da tela de login dali pra frente
 * (LoginInput.tenantId, ver auth.ts), entao precisa ser memorizavel.
 */
export interface CriarTenantInput {
  tenantId: string;
  razaoSocial: string;
  nomeAdmin: string;
  email: string;
  senha: string;
}

export interface CriarTenantResultado {
  accessToken: string;
  refreshToken: string;
  usuario: import('./usuario').Usuario;
  trialFimEm: string;
}

export interface StatusAssinatura {
  status: TenantAssinaturaStatus;
  trialFimEm: string | null;
  diasRestantesTrial: number | null;
  /** true quando o backend nao tem Stripe configurado (STRIPE_SECRET_KEY ausente) - "assinar agora" fica desabilitado com aviso, em vez de um botao que sempre falha. */
  cobrancaIndisponivel: boolean;
}

export interface IniciarCheckoutResultado {
  url: string;
}
