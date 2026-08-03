-- CreateEnum
CREATE TYPE "UsuarioStatus" AS ENUM ('ATIVO', 'AFASTADO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "LeadEstado" AS ENUM ('EM_FILA_DE_DISTRIBUICAO', 'DISTRIBUIDO', 'EM_ATENDIMENTO', 'INATIVO', 'CONVERTIDO');

-- CreateEnum
CREATE TYPE "InteracaoTipo" AS ENUM ('CONTATO', 'VISITA', 'PROPOSTA', 'NOTA', 'PAUSA');

-- AlterTable
ALTER TABLE "pessoa" ADD COLUMN     "telefone_normalizado" TEXT;

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "unidade_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "status" "UsuarioStatus" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "unidade_id" TEXT NOT NULL,
    "pessoa_id" TEXT NOT NULL,
    "responsavel_usuario_id" TEXT,
    "estado" "LeadEstado" NOT NULL DEFAULT 'EM_FILA_DE_DISTRIBUICAO',
    "janela_exclusividade_fim" TIMESTAMP(3),
    "origem_canal" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacao_de_lead" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" "InteracaoTipo" NOT NULL,
    "qualificado" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interacao_de_lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usuario_tenant_id_idx" ON "usuario"("tenant_id");

-- CreateIndex
CREATE INDEX "lead_tenant_id_idx" ON "lead"("tenant_id");

-- CreateIndex
CREATE INDEX "lead_tenant_id_estado_idx" ON "lead"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "interacao_de_lead_tenant_id_idx" ON "interacao_de_lead"("tenant_id");

-- CreateIndex
CREATE INDEX "interacao_de_lead_lead_id_idx" ON "interacao_de_lead"("lead_id");

-- CreateIndex
CREATE INDEX "pessoa_tenant_id_documento_normalizado_idx" ON "pessoa"("tenant_id", "documento_normalizado");

-- CreateIndex
CREATE INDEX "pessoa_tenant_id_telefone_normalizado_idx" ON "pessoa"("tenant_id", "telefone_normalizado");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_responsavel_usuario_id_fkey" FOREIGN KEY ("responsavel_usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacao_de_lead" ADD CONSTRAINT "interacao_de_lead_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacao_de_lead" ADD CONSTRAINT "interacao_de_lead_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
