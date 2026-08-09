-- CreateEnum
CREATE TYPE "DocumentoDeContratoTipo" AS ENUM ('CONTRATO_ASSINADO', 'LAUDO_VISTORIA', 'COMPROVANTE_GARANTIA', 'TERMO_RENOVACAO', 'TERMO_RESCISAO', 'OUTRO');

-- CreateTable
CREATE TABLE "documento_de_contrato" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contrato_de_locacao_id" TEXT NOT NULL,
    "tipo" "DocumentoDeContratoTipo" NOT NULL,
    "descricao" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "anexado_por_usuario_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_de_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_de_contrato_tenant_id_idx" ON "documento_de_contrato"("tenant_id");

-- CreateIndex
CREATE INDEX "documento_de_contrato_tenant_id_contrato_de_locacao_id_idx" ON "documento_de_contrato"("tenant_id", "contrato_de_locacao_id");

-- AddForeignKey
ALTER TABLE "documento_de_contrato" ADD CONSTRAINT "documento_de_contrato_contrato_de_locacao_id_fkey" FOREIGN KEY ("contrato_de_locacao_id") REFERENCES "contrato_de_locacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
