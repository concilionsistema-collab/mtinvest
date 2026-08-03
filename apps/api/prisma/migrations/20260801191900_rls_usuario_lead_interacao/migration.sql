-- Row-Level Security para usuario, lead e interacao_de_lead (DEC-TEC-001,
-- ART-005 secao 8). Mesmo padrao das migrations anteriores.

ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuario" FORCE ROW LEVEL SECURITY;

CREATE POLICY "usuario_tenant_isolation" ON "usuario"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE "lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead" FORCE ROW LEVEL SECURITY;

CREATE POLICY "lead_tenant_isolation" ON "lead"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE "interacao_de_lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interacao_de_lead" FORCE ROW LEVEL SECURITY;

CREATE POLICY "interacao_de_lead_tenant_isolation" ON "interacao_de_lead"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
