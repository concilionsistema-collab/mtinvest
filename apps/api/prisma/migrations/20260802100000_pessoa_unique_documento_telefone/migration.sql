-- US-007, CA-002 (ART-014): fecha a lacuna de atomicidade sob concorrencia
-- registrada no README ("checagem de duplicidade e 'verificar depois agir',
-- sem trava/constraint unica no banco"). Substitui os indices simples por
-- constraints unicas - o Postgres trata cada NULL como distinto por padrao
-- em UNIQUE, entao pessoas sem telefone/documento informado continuam
-- coexistindo livremente; a unicidade so vale quando o valor normalizado
-- existe. LeadsService.capturar trata a violacao (P2002) refazendo a
-- operacao em vez de deixar vazar como erro 500.

DROP INDEX "pessoa_tenant_id_documento_normalizado_idx";
DROP INDEX "pessoa_tenant_id_telefone_normalizado_idx";

CREATE UNIQUE INDEX "pessoa_tenant_id_documento_normalizado_key" ON "pessoa"("tenant_id", "documento_normalizado");
CREATE UNIQUE INDEX "pessoa_tenant_id_telefone_normalizado_key" ON "pessoa"("tenant_id", "telefone_normalizado");
