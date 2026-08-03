-- CreateEnum
CREATE TYPE "PessoaTipo" AS ENUM ('FISICA', 'JURIDICA');

-- CreateTable
CREATE TABLE "pessoa" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" "PessoaTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "documento_normalizado" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imovel_coproprietario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "imovel_id" TEXT NOT NULL,
    "pessoa_id" TEXT NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "vigente_de" DATE NOT NULL,
    "vigente_ate" DATE,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imovel_coproprietario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pessoa_tenant_id_idx" ON "pessoa"("tenant_id");

-- CreateIndex
CREATE INDEX "imovel_coproprietario_tenant_id_idx" ON "imovel_coproprietario"("tenant_id");

-- CreateIndex
CREATE INDEX "imovel_coproprietario_imovel_id_idx" ON "imovel_coproprietario"("imovel_id");

-- AddForeignKey
ALTER TABLE "imovel_coproprietario" ADD CONSTRAINT "imovel_coproprietario_imovel_id_fkey" FOREIGN KEY ("imovel_id") REFERENCES "imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imovel_coproprietario" ADD CONSTRAINT "imovel_coproprietario_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
