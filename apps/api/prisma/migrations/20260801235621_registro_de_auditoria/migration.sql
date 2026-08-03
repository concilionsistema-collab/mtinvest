-- CreateTable
CREATE TABLE "registro_de_auditoria" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ator_usuario_id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade_tipo" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_de_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registro_de_auditoria_tenant_id_idx" ON "registro_de_auditoria"("tenant_id");

-- CreateIndex
CREATE INDEX "registro_de_auditoria_tenant_id_entidade_tipo_entidade_id_idx" ON "registro_de_auditoria"("tenant_id", "entidade_tipo", "entidade_id");

-- AddForeignKey
ALTER TABLE "registro_de_auditoria" ADD CONSTRAINT "registro_de_auditoria_ator_usuario_id_fkey" FOREIGN KEY ("ator_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
