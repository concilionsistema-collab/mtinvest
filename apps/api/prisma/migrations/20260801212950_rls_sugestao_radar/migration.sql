-- Row-Level Security para sugestao_radar (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova, entao toda tabela tenant-scoped precisa
-- desta migration companheira (ver README.md, "Banco de dados em uso").

ALTER TABLE "sugestao_radar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sugestao_radar" FORCE ROW LEVEL SECURITY;

CREATE POLICY "sugestao_radar_tenant_isolation" ON "sugestao_radar"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
