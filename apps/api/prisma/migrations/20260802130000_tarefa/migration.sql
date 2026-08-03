-- CreateTable
CREATE TABLE "tarefa" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "prazo" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarefa_tenant_id_idx" ON "tarefa"("tenant_id");

-- CreateIndex
CREATE INDEX "tarefa_tenant_id_usuario_id_idx" ON "tarefa"("tenant_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
