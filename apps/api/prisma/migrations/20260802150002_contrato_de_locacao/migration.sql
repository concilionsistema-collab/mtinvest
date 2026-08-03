-- CreateEnum
CREATE TYPE "ContratoDeLocacaoEstado" AS ENUM ('RASCUNHO', 'EM_ASSINATURA', 'AGUARDANDO_VISTORIA_ENTRADA', 'VIGENTE', 'EM_ENCERRAMENTO', 'EM_ENCERRAMENTO_ANTECIPADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "IndiceReajuste" AS ENUM ('IGPM', 'IPCA', 'OUTRO');

-- CreateTable
CREATE TABLE "contrato_de_locacao" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contrato_de_administracao_id" TEXT NOT NULL,
    "inquilino_pessoa_id" TEXT NOT NULL,
    "estado" "ContratoDeLocacaoEstado" NOT NULL DEFAULT 'RASCUNHO',
    "valor_aluguel" DECIMAL(12,2) NOT NULL,
    "dia_vencimento" INTEGER NOT NULL,
    "indice_reajuste" "IndiceReajuste" NOT NULL,
    "aceita_reajuste_negativo" BOOLEAN NOT NULL,
    "data_inicio" DATE NOT NULL,
    "prazo_meses" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_de_locacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contrato_de_locacao_tenant_id_idx" ON "contrato_de_locacao"("tenant_id");

-- CreateIndex
CREATE INDEX "contrato_de_locacao_tenant_id_contrato_de_administracao_id_idx" ON "contrato_de_locacao"("tenant_id", "contrato_de_administracao_id");

-- AddForeignKey
ALTER TABLE "contrato_de_locacao" ADD CONSTRAINT "contrato_de_locacao_contrato_de_administracao_id_fkey" FOREIGN KEY ("contrato_de_administracao_id") REFERENCES "contrato_de_administracao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_de_locacao" ADD CONSTRAINT "contrato_de_locacao_inquilino_pessoa_id_fkey" FOREIGN KEY ("inquilino_pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
