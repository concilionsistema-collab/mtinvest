-- Row-Level Security por tenant, conforme DEC-TEC-001 (ART: decisoes/DEC-TEC-001)
-- e ART-005, secao 8 (Segregacao multi-tenant): "banco compartilhado com tenant_id
-- obrigatorio ... e row-level security (RLS) aplicado no banco, nao apenas filtro
-- na aplicacao".
--
-- A aplicacao deve, em toda transacao, executar:
--   SET LOCAL app.tenant_id = '<uuid-do-tenant-do-usuario-autenticado>';
-- antes de qualquer consulta (ver apps/api/src/common/tenant/tenant-prisma.service.ts).
--
-- IMPORTANTE (operacao real, fora do escopo deste scaffold): o usuario de banco
-- usado pela aplicacao em producao NAO deve ser o owner das tabelas - donos de
-- tabela ignoram RLS por padrao no PostgreSQL. Use um role de aplicacao dedicado
-- sem privilegio de BYPASSRLS.

ALTER TABLE "unidade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unidade" FORCE ROW LEVEL SECURITY;

CREATE POLICY "unidade_tenant_isolation" ON "unidade"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
