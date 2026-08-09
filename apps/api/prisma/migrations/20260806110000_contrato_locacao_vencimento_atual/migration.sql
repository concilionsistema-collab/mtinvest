-- AlterTable: coluna nullable primeiro, backfill dos contratos ja existentes
-- (vencimento = data_inicio + prazo_meses), so depois NOT NULL.
ALTER TABLE "contrato_de_locacao" ADD COLUMN "vencimento_atual" DATE;

UPDATE "contrato_de_locacao"
SET "vencimento_atual" = ("data_inicio" + ("prazo_meses" || ' months')::interval)::date
WHERE "vencimento_atual" IS NULL;

ALTER TABLE "contrato_de_locacao" ALTER COLUMN "vencimento_atual" SET NOT NULL;
