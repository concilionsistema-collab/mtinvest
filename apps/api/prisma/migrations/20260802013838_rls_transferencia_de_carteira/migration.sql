-- Row-Level Security para transferencia_de_carteira (DEC-TEC-001, ART-005 secao 8).
-- Mesmo padrao das migrations anteriores - Supabase habilita RLS sem
-- politica em toda tabela nova (ver README.md, "Banco de dados em uso").

ALTER TABLE "transferencia_de_carteira" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transferencia_de_carteira" FORCE ROW LEVEL SECURITY;

CREATE POLICY "transferencia_de_carteira_tenant_isolation" ON "transferencia_de_carteira"
    USING (tenant_id = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
