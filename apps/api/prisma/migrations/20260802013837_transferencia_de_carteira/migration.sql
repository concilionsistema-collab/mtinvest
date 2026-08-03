-- CreateEnum
CREATE TYPE "TransferenciaCarteiraEstado" AS ENUM ('PENDENTE', 'TRANSFERIDA', 'ESCALADA_MATRIZ');

-- CreateTable
CREATE TABLE "transferencia_de_carteira" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "origem_usuario_id" TEXT,
    "destino_usuario_id" TEXT,
    "estado" "TransferenciaCarteiraEstado" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT NOT NULL,
    "sla_decisao_fim" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidido_em" TIMESTAMP(3),

    CONSTRAINT "transferencia_de_carteira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transferencia_de_carteira_tenant_id_idx" ON "transferencia_de_carteira"("tenant_id");

-- CreateIndex
CREATE INDEX "transferencia_de_carteira_tenant_id_estado_idx" ON "transferencia_de_carteira"("tenant_id", "estado");

-- AddForeignKey
ALTER TABLE "transferencia_de_carteira" ADD CONSTRAINT "transferencia_de_carteira_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_de_carteira" ADD CONSTRAINT "transferencia_de_carteira_origem_usuario_id_fkey" FOREIGN KEY ("origem_usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_de_carteira" ADD CONSTRAINT "transferencia_de_carteira_destino_usuario_id_fkey" FOREIGN KEY ("destino_usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
