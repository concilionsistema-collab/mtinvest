-- Row-Level Security para tarefa (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "tarefa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tarefa" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tarefa_tenant_isolation" ON "tarefa"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
