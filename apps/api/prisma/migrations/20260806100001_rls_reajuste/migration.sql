-- Row-Level Security para reajuste (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "reajuste" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reajuste" FORCE ROW LEVEL SECURITY;

CREATE POLICY "reajuste_tenant_isolation" ON "reajuste"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
