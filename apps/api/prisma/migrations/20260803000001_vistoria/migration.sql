-- CreateEnum
CREATE TYPE "VistoriaTipo" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "VistoriaEstado" AS ENUM ('AGENDADA', 'REALIZADA', 'CONFIRMADA', 'EM_CONTESTACAO', 'RETIFICADA');

-- CreateTable
CREATE TABLE "vistoria" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contrato_de_locacao_id" TEXT NOT NULL,
    "tipo" "VistoriaTipo" NOT NULL,
    "estado" "VistoriaEstado" NOT NULL DEFAULT 'AGENDADA',
    "data_hora" TIMESTAMP(3) NOT NULL,
    "laudo" TEXT,
    "evidencias" TEXT,
    "realizada_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vistoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vistoria_tenant_id_idx" ON "vistoria"("tenant_id");

-- CreateIndex
CREATE INDEX "vistoria_tenant_id_contrato_de_locacao_id_idx" ON "vistoria"("tenant_id", "contrato_de_locacao_id");

-- AddForeignKey
ALTER TABLE "vistoria" ADD CONSTRAINT "vistoria_contrato_de_locacao_id_fkey" FOREIGN KEY ("contrato_de_locacao_id") REFERENCES "contrato_de_locacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
