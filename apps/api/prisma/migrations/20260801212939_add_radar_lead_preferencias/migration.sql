-- CreateEnum
CREATE TYPE "SugestaoRadarStatus" AS ENUM ('ACEITA', 'RECUSADA');

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "finalidade_desejada" "ImovelFinalidade",
ADD COLUMN     "orcamento_maximo" DECIMAL(14,2),
ADD COLUMN     "orcamento_minimo" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "sugestao_radar" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "imovel_id" TEXT NOT NULL,
    "status" "SugestaoRadarStatus" NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugestao_radar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sugestao_radar_tenant_id_idx" ON "sugestao_radar"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sugestao_radar_tenant_id_lead_id_imovel_id_key" ON "sugestao_radar"("tenant_id", "lead_id", "imovel_id");

-- AddForeignKey
ALTER TABLE "sugestao_radar" ADD CONSTRAINT "sugestao_radar_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestao_radar" ADD CONSTRAINT "sugestao_radar_imovel_id_fkey" FOREIGN KEY ("imovel_id") REFERENCES "imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
