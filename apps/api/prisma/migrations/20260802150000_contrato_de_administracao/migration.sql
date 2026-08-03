-- CreateEnum
CREATE TYPE "ContratoDeAdministracaoStatus" AS ENUM ('ATIVO', 'ENCERRADO');

-- CreateTable
CREATE TABLE "contrato_de_administracao" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "unidade_id" TEXT NOT NULL,
    "imovel_id" TEXT NOT NULL,
    "proprietario_pessoa_id" TEXT NOT NULL,
    "status" "ContratoDeAdministracaoStatus" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_de_administracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contrato_de_administracao_tenant_id_idx" ON "contrato_de_administracao"("tenant_id");

-- CreateIndex
CREATE INDEX "contrato_de_administracao_tenant_id_imovel_id_idx" ON "contrato_de_administracao"("tenant_id", "imovel_id");

-- AddForeignKey
ALTER TABLE "contrato_de_administracao" ADD CONSTRAINT "contrato_de_administracao_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_de_administracao" ADD CONSTRAINT "contrato_de_administracao_imovel_id_fkey" FOREIGN KEY ("imovel_id") REFERENCES "imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_de_administracao" ADD CONSTRAINT "contrato_de_administracao_proprietario_pessoa_id_fkey" FOREIGN KEY ("proprietario_pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
