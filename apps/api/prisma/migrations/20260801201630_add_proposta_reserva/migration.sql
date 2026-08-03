-- CreateEnum
CREATE TYPE "PropostaTipo" AS ENUM ('INICIAL', 'CONTRAPROPOSTA');

-- CreateEnum
CREATE TYPE "PropostaStatus" AS ENUM ('ENVIADA', 'ACEITA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "ReservaEstado" AS ENUM ('ATIVA', 'EXPIRADA', 'CONVERTIDA', 'CANCELADA');

-- AlterTable
ALTER TABLE "imovel" ADD COLUMN     "percentual_desconto_pre_autorizado" DECIMAL(5,2),
ADD COLUMN     "valor_anunciado" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "proposta" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "tipo" "PropostaTipo" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "condicoes" TEXT NOT NULL,
    "status" "PropostaStatus" NOT NULL DEFAULT 'ENVIADA',
    "aprovador_usuario_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "proposta_id" TEXT NOT NULL,
    "estado" "ReservaEstado" NOT NULL DEFAULT 'ATIVA',
    "expira_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposta_tenant_id_idx" ON "proposta"("tenant_id");

-- CreateIndex
CREATE INDEX "proposta_oportunidade_id_idx" ON "proposta"("oportunidade_id");

-- CreateIndex
CREATE INDEX "reserva_tenant_id_idx" ON "reserva"("tenant_id");

-- CreateIndex
CREATE INDEX "reserva_oportunidade_id_idx" ON "reserva"("oportunidade_id");

-- AddForeignKey
ALTER TABLE "proposta" ADD CONSTRAINT "proposta_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_proposta_id_fkey" FOREIGN KEY ("proposta_id") REFERENCES "proposta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
