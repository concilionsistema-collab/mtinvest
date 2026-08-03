-- Row-Level Security para oportunidade (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores.

ALTER TABLE "oportunidade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oportunidade" FORCE ROW LEVEL SECURITY;

CREATE POLICY "oportunidade_tenant_isolation" ON "oportunidade"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
