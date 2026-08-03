-- Row-Level Security para registro_de_auditoria (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "registro_de_auditoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registro_de_auditoria" FORCE ROW LEVEL SECURITY;

CREATE POLICY "registro_de_auditoria_tenant_isolation" ON "registro_de_auditoria"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
