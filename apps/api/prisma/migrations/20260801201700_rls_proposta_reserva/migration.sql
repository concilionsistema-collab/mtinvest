-- Row-Level Security para proposta e reserva (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores.

ALTER TABLE "proposta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proposta" FORCE ROW LEVEL SECURITY;

CREATE POLICY "proposta_tenant_isolation" ON "proposta"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE "reserva" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reserva" FORCE ROW LEVEL SECURITY;

CREATE POLICY "reserva_tenant_isolation" ON "reserva"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
