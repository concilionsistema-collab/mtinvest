-- Row-Level Security para pessoa e imovel_coproprietario (DEC-TEC-001,
-- ART-005 secao 8). Mesmo padrao das migrations anteriores: o Supabase liga
-- relrowsecurity automaticamente em tabela nova, sem politica - e preciso
-- adicionar a politica de isolamento por tenant explicitamente.

ALTER TABLE "pessoa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pessoa" FORCE ROW LEVEL SECURITY;

CREATE POLICY "pessoa_tenant_isolation" ON "pessoa"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE "imovel_coproprietario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imovel_coproprietario" FORCE ROW LEVEL SECURITY;

CREATE POLICY "imovel_coproprietario_tenant_isolation" ON "imovel_coproprietario"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
