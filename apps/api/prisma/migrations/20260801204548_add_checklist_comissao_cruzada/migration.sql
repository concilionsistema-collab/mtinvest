-- CreateTable
CREATE TABLE "checklist_documento_item" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_documento_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissao_cruzada_acionada" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "unidade_proprietaria_imovel_id" TEXT NOT NULL,
    "unidade_responsavel_lead_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissao_cruzada_acionada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_documento_item_tenant_id_idx" ON "checklist_documento_item"("tenant_id");

-- CreateIndex
CREATE INDEX "checklist_documento_item_oportunidade_id_idx" ON "checklist_documento_item"("oportunidade_id");

-- CreateIndex
CREATE INDEX "comissao_cruzada_acionada_tenant_id_idx" ON "comissao_cruzada_acionada"("tenant_id");

-- CreateIndex
CREATE INDEX "comissao_cruzada_acionada_oportunidade_id_idx" ON "comissao_cruzada_acionada"("oportunidade_id");

-- AddForeignKey
ALTER TABLE "checklist_documento_item" ADD CONSTRAINT "checklist_documento_item_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissao_cruzada_acionada" ADD CONSTRAINT "comissao_cruzada_acionada_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
