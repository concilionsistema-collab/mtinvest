-- Row-Level Security para documento_de_contrato (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "documento_de_contrato" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documento_de_contrato" FORCE ROW LEVEL SECURITY;

CREATE POLICY "documento_de_contrato_tenant_isolation" ON "documento_de_contrato"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
