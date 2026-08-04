-- Correcao registrada: campo RN-402 (ART-010) que deveria ter sido criado
-- junto com o resto do contrato (US-102). Tabela sem linhas em producao no
-- momento desta migration - NOT NULL sem DEFAULT e seguro (nada a
-- retroalimentar).
ALTER TABLE "contrato_de_locacao" ADD COLUMN "exige_garantia" BOOLEAN NOT NULL;
