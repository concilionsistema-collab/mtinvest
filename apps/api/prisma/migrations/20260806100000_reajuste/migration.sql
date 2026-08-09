-- CreateTable
CREATE TABLE "reajuste" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contrato_de_locacao_id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "indice" "IndiceReajuste" NOT NULL,
    "percentual_indice" DECIMAL(7,4) NOT NULL,
    "percentual_aplicado" DECIMAL(7,4) NOT NULL,
    "valor_aluguel_anterior" DECIMAL(12,2) NOT NULL,
    "valor_aluguel_novo" DECIMAL(12,2) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reajuste_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reajuste_tenant_id_idx" ON "reajuste"("tenant_id");

-- CreateIndex
CREATE INDEX "reajuste_tenant_id_contrato_de_locacao_id_idx" ON "reajuste"("tenant_id", "contrato_de_locacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "reajuste_tenant_id_contrato_de_locacao_id_competencia_key" ON "reajuste"("tenant_id", "contrato_de_locacao_id", "competencia");

-- AddForeignKey
ALTER TABLE "reajuste" ADD CONSTRAINT "reajuste_contrato_de_locacao_id_fkey" FOREIGN KEY ("contrato_de_locacao_id") REFERENCES "contrato_de_locacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
