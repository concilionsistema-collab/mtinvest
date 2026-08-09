-- Row-Level Security para acesso_portal_contrato (DEC-TEC-001, ART-005 secao 8).
--
-- Duas politicas, mesmo espirito de "tenant_leitura_app" (US-108/SchedulerService):
--
-- 1) Isolamento de tenant padrao (FOR ALL) - cobre a criacao/listagem/revogacao
--    de acesso, que sempre roda com contexto de tenant ja estabelecido
--    (PortalAcessosService, chamado por um GESTOR_UNIDADE autenticado).
--
-- 2) Leitura por token (FOR SELECT USING (true)) - o portal publico (US-113,
--    RN-413) e acessado por proprietario/inquilino SEM login como Usuario,
--    entao nao ha contexto de tenant nenhum ate o token ser resolvido. Uma
--    linha desta tabela (id, tenant_id, contrato_id, pessoa_id, token_hash,
--    revogado_em) nao expoe dado sensivel por si so - so o HASH do token
--    (irreversivel) e IDs internos; o dado real do contrato so e lido depois,
--    ja dentro do contexto de tenant correto (PortalService.consultar).
ALTER TABLE "acesso_portal_contrato" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acesso_portal_contrato" FORCE ROW LEVEL SECURITY;

CREATE POLICY "acesso_portal_contrato_tenant_isolation" ON "acesso_portal_contrato"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY "acesso_portal_contrato_leitura_por_token" ON "acesso_portal_contrato"
    FOR SELECT
    USING (true);
