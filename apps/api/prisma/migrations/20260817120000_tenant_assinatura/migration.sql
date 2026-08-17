-- Onboarding self-service + cobranca (Stripe). Ver TenantAssinaturaStatus em
-- schema.prisma para o significado de cada valor.
--
-- DEFAULT 'ATIVA': tenants ja existentes (ex.: o tenant de producao atual)
-- ficam ATIVA por essa migracao, nunca travados retroativamente - so
-- tenants novos criados via POST /tenants comecam em TRIAL explicitamente.
CREATE TYPE "TenantAssinaturaStatus" AS ENUM ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'CANCELADA');

ALTER TABLE "tenant" ADD COLUMN "assinatura_status" "TenantAssinaturaStatus" NOT NULL DEFAULT 'ATIVA';
ALTER TABLE "tenant" ADD COLUMN "trial_fim_em" TIMESTAMP(3);
ALTER TABLE "tenant" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "tenant" ADD COLUMN "stripe_subscription_id" TEXT;
