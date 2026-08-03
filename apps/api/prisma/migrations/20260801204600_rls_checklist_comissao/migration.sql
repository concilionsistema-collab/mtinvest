-- Row-Level Security para checklist_documento_item e comissao_cruzada_acionada
-- (DEC-TEC-001, ART-005 secao 8). Mesmo padrao das migrations anteriores.

ALTER TABLE "checklist_documento_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_documento_item" FORCE ROW LEVEL SECURITY;

CREATE POLICY "checklist_documento_item_tenant_isolation" ON "checklist_documento_item"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE "comissao_cruzada_acionada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comissao_cruzada_acionada" FORCE ROW LEVEL SECURITY;

CREATE POLICY "comissao_cruzada_acionada_tenant_isolation" ON "comissao_cruzada_acionada"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
