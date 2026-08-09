-- Row-Level Security para encerramento_antecipado (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "encerramento_antecipado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encerramento_antecipado" FORCE ROW LEVEL SECURITY;

CREATE POLICY "encerramento_antecipado_tenant_isolation" ON "encerramento_antecipado"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
