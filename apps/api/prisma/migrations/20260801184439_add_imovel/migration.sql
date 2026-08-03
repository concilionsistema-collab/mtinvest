-- CreateEnum
CREATE TYPE "ImovelFinalidade" AS ENUM ('VENDA', 'LOCACAO', 'AMBOS');

-- CreateEnum
CREATE TYPE "ImovelEstadoCompartilhamento" AS ENUM ('EXCLUSIVO_DA_UNIDADE', 'COMPARTILHADO', 'COMPARTILHADO_EM_NEGOCIACAO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "ImovelEscopoCompartilhamento" AS ENUM ('FECHADO', 'REDE', 'REGIAO', 'LISTA');

-- CreateEnum
CREATE TYPE "CompartilhamentoEvento" AS ENUM ('COMPARTILHADO', 'NEGOCIACAO_INICIADA', 'REVOGADO', 'ENCERRADO');

-- DropIndex
DROP INDEX "unidade_tenant_id_idx";

-- CreateTable
CREATE TABLE "imovel" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "unidade_proprietaria_id" TEXT NOT NULL,
    "finalidade" "ImovelFinalidade" NOT NULL,
    "endereco_resumo" TEXT NOT NULL,
    "estado_compartilhamento" "ImovelEstadoCompartilhamento" NOT NULL DEFAULT 'EXCLUSIVO_DA_UNIDADE',
    "escopo_compartilhamento" "ImovelEscopoCompartilhamento",
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compartilhamento_de_imovel" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "imovel_id" TEXT NOT NULL,
    "evento" "CompartilhamentoEvento" NOT NULL,
    "unidade_envolvida_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compartilhamento_de_imovel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imovel_tenant_id_idx" ON "imovel"("tenant_id");

-- CreateIndex
CREATE INDEX "compartilhamento_de_imovel_tenant_id_idx" ON "compartilhamento_de_imovel"("tenant_id");

-- AddForeignKey
ALTER TABLE "imovel" ADD CONSTRAINT "imovel_unidade_proprietaria_id_fkey" FOREIGN KEY ("unidade_proprietaria_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compartilhamento_de_imovel" ADD CONSTRAINT "compartilhamento_de_imovel_imovel_id_fkey" FOREIGN KEY ("imovel_id") REFERENCES "imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compartilhamento_de_imovel" ADD CONSTRAINT "compartilhamento_de_imovel_unidade_envolvida_id_fkey" FOREIGN KEY ("unidade_envolvida_id") REFERENCES "unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
