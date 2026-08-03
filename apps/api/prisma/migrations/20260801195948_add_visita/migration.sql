-- CreateEnum
CREATE TYPE "VisitaEstado" AS ENUM ('AGENDADA', 'CONFIRMADA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "VisitaResultado" AS ENUM ('INTERESSADO', 'NAO_INTERESSADO', 'INTERESSADO_EM_OUTRO_IMOVEL', 'NAO_COMPARECEU');

-- CreateTable
CREATE TABLE "visita" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "data_hora" TIMESTAMP(3) NOT NULL,
    "estado" "VisitaEstado" NOT NULL DEFAULT 'AGENDADA',
    "resultado" "VisitaResultado",
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visita_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visita_tenant_id_idx" ON "visita"("tenant_id");

-- CreateIndex
CREATE INDEX "visita_oportunidade_id_idx" ON "visita"("oportunidade_id");

-- AddForeignKey
ALTER TABLE "visita" ADD CONSTRAINT "visita_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
