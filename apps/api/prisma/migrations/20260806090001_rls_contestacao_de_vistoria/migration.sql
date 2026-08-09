-- Row-Level Security para contestacao_de_vistoria (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "contestacao_de_vistoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contestacao_de_vistoria" FORCE ROW LEVEL SECURITY;

CREATE POLICY "contestacao_de_vistoria_tenant_isolation" ON "contestacao_de_vistoria"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
