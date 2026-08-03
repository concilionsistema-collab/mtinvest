-- Row-Level Security para refresh_token (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "refresh_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_token" FORCE ROW LEVEL SECURITY;

CREATE POLICY "refresh_token_tenant_isolation" ON "refresh_token"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
