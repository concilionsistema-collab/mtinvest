-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ATIVO', 'SUSPENSO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "UnidadeStatus" AS ENUM ('ATIVA', 'INATIVA');

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidade" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome_fantasia" TEXT NOT NULL,
    "status" "UnidadeStatus" NOT NULL DEFAULT 'ATIVA',
    "e_matriz" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (ART-005, secao 3: tenant_id indexado em toda entidade tenant-scoped)
CREATE INDEX "unidade_tenant_id_idx" ON "unidade"("tenant_id");

-- AddForeignKey
ALTER TABLE "unidade" ADD CONSTRAINT "unidade_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
