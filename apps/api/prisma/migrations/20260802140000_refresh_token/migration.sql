-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "revogado_em" TIMESTAMP(3),

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refresh_token_tenant_id_idx" ON "refresh_token"("tenant_id");

-- CreateIndex
CREATE INDEX "refresh_token_tenant_id_usuario_id_token_hash_idx" ON "refresh_token"("tenant_id", "usuario_id", "token_hash");

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
