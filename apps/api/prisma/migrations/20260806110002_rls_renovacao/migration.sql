-- Row-Level Security para renovacao (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "renovacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "renovacao" FORCE ROW LEVEL SECURITY;

CREATE POLICY "renovacao_tenant_isolation" ON "renovacao"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
