-- CreateEnum
CREATE TYPE "OportunidadeEstado" AS ENUM ('QUALIFICACAO', 'VISITA_AGENDADA', 'VISITA_CONFIRMADA', 'VISITA_REALIZADA', 'PROPOSTA_ENVIADA', 'EM_CONTRAPROPOSTA', 'RESERVA', 'DOCUMENTACAO_CONCLUIDA', 'FECHADA', 'PERDIDA');

-- CreateTable
CREATE TABLE "oportunidade" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "imovel_id" TEXT NOT NULL,
    "estado" "OportunidadeEstado" NOT NULL DEFAULT 'QUALIFICACAO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oportunidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oportunidade_tenant_id_idx" ON "oportunidade"("tenant_id");

-- CreateIndex
CREATE INDEX "oportunidade_tenant_id_estado_idx" ON "oportunidade"("tenant_id", "estado");

-- AddForeignKey
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_imovel_id_fkey" FOREIGN KEY ("imovel_id") REFERENCES "imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
