-- AlterTable
ALTER TABLE "vistoria" ADD COLUMN "realizado_por_usuario_id" TEXT;
ALTER TABLE "vistoria" ADD COLUMN "prazo_contestacao_ate" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "vistoria" ADD CONSTRAINT "vistoria_realizado_por_usuario_id_fkey" FOREIGN KEY ("realizado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ContestacaoDecisao" AS ENUM ('CONFIRMADA', 'RETIFICADA');

-- CreateTable
CREATE TABLE "contestacao_de_vistoria" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vistoria_id" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "evidencia" TEXT,
    "contestado_por_usuario_id" TEXT NOT NULL,
    "analista_usuario_id" TEXT,
    "decisao" "ContestacaoDecisao",
    "justificativa_decisao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidido_em" TIMESTAMP(3),

    CONSTRAINT "contestacao_de_vistoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contestacao_de_vistoria_tenant_id_idx" ON "contestacao_de_vistoria"("tenant_id");

-- CreateIndex
CREATE INDEX "contestacao_de_vistoria_tenant_id_vistoria_id_idx" ON "contestacao_de_vistoria"("tenant_id", "vistoria_id");

-- AddForeignKey
ALTER TABLE "contestacao_de_vistoria" ADD CONSTRAINT "contestacao_de_vistoria_vistoria_id_fkey" FOREIGN KEY ("vistoria_id") REFERENCES "vistoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
