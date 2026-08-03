-- Row-Level Security para visita (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores.

ALTER TABLE "visita" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visita" FORCE ROW LEVEL SECURITY;

CREATE POLICY "visita_tenant_isolation" ON "visita"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
