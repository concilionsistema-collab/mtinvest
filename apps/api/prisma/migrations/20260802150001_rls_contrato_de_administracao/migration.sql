-- Row-Level Security para contrato_de_administracao (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "contrato_de_administracao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contrato_de_administracao" FORCE ROW LEVEL SECURITY;

CREATE POLICY "contrato_de_administracao_tenant_isolation" ON "contrato_de_administracao"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
