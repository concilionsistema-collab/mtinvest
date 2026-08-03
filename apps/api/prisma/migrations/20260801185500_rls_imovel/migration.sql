-- Row-Level Security para imovel e compartilhamento_de_imovel (DEC-TEC-001,
-- ART-005 secao 8). O Supabase habilita relrowsecurity automaticamente em
-- toda tabela nova do schema public, mas sem nenhuma politica - o que
-- bloqueia TODO acesso pelo role de aplicacao (default-deny). Este migration
-- adiciona a mesma politica de isolamento por tenant ja usada em "unidade".

ALTER TABLE "imovel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imovel" FORCE ROW LEVEL SECURITY;

CREATE POLICY "imovel_tenant_isolation" ON "imovel"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE "compartilhamento_de_imovel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compartilhamento_de_imovel" FORCE ROW LEVEL SECURITY;

CREATE POLICY "compartilhamento_de_imovel_tenant_isolation" ON "compartilhamento_de_imovel"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- "tenant" tambem foi auto-protegida pelo Supabase sem politica. Como hoje
-- nenhuma rota da aplicacao cria/altera tenant (isso e administrativo, feito
-- via role postgres), liberamos apenas leitura do proprio tenant pelo role
-- de aplicacao, para nao deixar a tabela inutilizavel por engano no futuro.
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_self_read" ON "tenant"
    FOR SELECT
    USING (id = current_setting('app.tenant_id', true));
