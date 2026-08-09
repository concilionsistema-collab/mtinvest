-- CreateTable
CREATE TABLE "renovacao" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contrato_de_locacao_id" TEXT NOT NULL,
    "prazo_adicional_meses" INTEGER NOT NULL,
    "vencimento_anterior" DATE NOT NULL,
    "novo_vencimento" DATE NOT NULL,
    "confirmado_por_usuario_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renovacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "renovacao_tenant_id_idx" ON "renovacao"("tenant_id");

-- CreateIndex
CREATE INDEX "renovacao_tenant_id_contrato_de_locacao_id_idx" ON "renovacao"("tenant_id", "contrato_de_locacao_id");

-- AddForeignKey
ALTER TABLE "renovacao" ADD CONSTRAINT "renovacao_contrato_de_locacao_id_fkey" FOREIGN KEY ("contrato_de_locacao_id") REFERENCES "contrato_de_locacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
