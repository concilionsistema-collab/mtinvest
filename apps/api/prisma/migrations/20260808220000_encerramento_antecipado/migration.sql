-- CreateTable
CREATE TABLE "encerramento_antecipado" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contrato_de_locacao_id" TEXT NOT NULL,
    "valor_referencia" DECIMAL(12,2) NOT NULL,
    "meses_restantes" INTEGER NOT NULL,
    "meses_totais" INTEGER NOT NULL,
    "percentual_proporcional" DECIMAL(5,4) NOT NULL,
    "valor_multa" DECIMAL(12,2) NOT NULL,
    "isento" BOOLEAN NOT NULL DEFAULT false,
    "motivo_isencao" TEXT,
    "confirmado_por_usuario_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encerramento_antecipado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "encerramento_antecipado_tenant_id_idx" ON "encerramento_antecipado"("tenant_id");

-- CreateIndex
CREATE INDEX "encerramento_antecipado_tenant_id_contrato_de_locacao_id_idx" ON "encerramento_antecipado"("tenant_id", "contrato_de_locacao_id");

-- AddForeignKey
ALTER TABLE "encerramento_antecipado" ADD CONSTRAINT "encerramento_antecipado_contrato_de_locacao_id_fkey" FOREIGN KEY ("contrato_de_locacao_id") REFERENCES "contrato_de_locacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
