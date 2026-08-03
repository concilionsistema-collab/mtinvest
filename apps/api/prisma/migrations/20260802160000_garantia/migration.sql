-- CreateEnum
CREATE TYPE "GarantiaTipo" AS ENUM ('FIADOR', 'CAUCAO', 'SEGURO_FIANCA');

-- CreateEnum
CREATE TYPE "GarantiaEstado" AS ENUM ('EM_ANALISE', 'ATIVA', 'EM_SUBSTITUICAO', 'EM_LIQUIDACAO', 'ENCERRADA');

-- CreateTable
CREATE TABLE "garantia" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contrato_de_locacao_id" TEXT NOT NULL,
    "tipo" "GarantiaTipo" NOT NULL,
    "estado" "GarantiaEstado" NOT NULL DEFAULT 'EM_ANALISE',
    "fiador_pessoa_id" TEXT,
    "substitui_garantia_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "garantia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "garantia_tenant_id_idx" ON "garantia"("tenant_id");

-- CreateIndex
CREATE INDEX "garantia_tenant_id_contrato_de_locacao_id_idx" ON "garantia"("tenant_id", "contrato_de_locacao_id");

-- AddForeignKey
ALTER TABLE "garantia" ADD CONSTRAINT "garantia_contrato_de_locacao_id_fkey" FOREIGN KEY ("contrato_de_locacao_id") REFERENCES "contrato_de_locacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantia" ADD CONSTRAINT "garantia_fiador_pessoa_id_fkey" FOREIGN KEY ("fiador_pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantia" ADD CONSTRAINT "garantia_substitui_garantia_id_fkey" FOREIGN KEY ("substitui_garantia_id") REFERENCES "garantia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
