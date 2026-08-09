-- CreateTable
CREATE TABLE "acesso_portal_contrato" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contrato_de_locacao_id" TEXT NOT NULL,
    "pessoa_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "criado_por_usuario_id" TEXT NOT NULL,
    "revogado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acesso_portal_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acesso_portal_contrato_token_hash_key" ON "acesso_portal_contrato"("token_hash");

-- CreateIndex
CREATE INDEX "acesso_portal_contrato_tenant_id_idx" ON "acesso_portal_contrato"("tenant_id");

-- CreateIndex
CREATE INDEX "acesso_portal_contrato_tenant_id_contrato_de_locacao_id_idx" ON "acesso_portal_contrato"("tenant_id", "contrato_de_locacao_id");

-- AddForeignKey
ALTER TABLE "acesso_portal_contrato" ADD CONSTRAINT "acesso_portal_contrato_contrato_de_locacao_id_fkey" FOREIGN KEY ("contrato_de_locacao_id") REFERENCES "contrato_de_locacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso_portal_contrato" ADD CONSTRAINT "acesso_portal_contrato_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
