-- Row-Level Security para tenant (DEC-TEC-001, ART-005 secao 8).
-- "tenant" nao tem tenant_id (e a propria raiz) - o Supabase ja liga RLS sem
-- politica por padrao em toda tabela nova (mesmo comportamento documentado
-- em README.md, "Banco de dados em uso"), o que bloqueia total e
-- silenciosamente ate leitura para o role `crm_app` (confirmado: SELECT
-- retorna 0 linhas, INSERT falha com "row violates row-level security
-- policy"). Ate agora isso era inofensivo porque nenhum caminho de codigo em
-- runtime lia "tenant" pelo role da aplicacao (bootstrap de Tenant sempre
-- foi administrativo, ver README "Como rodar localmente").
--
-- Com o SchedulerService (jobs reais, troca dos agendadores "preguicosos")
-- precisando enumerar todos os tenants para varrer cada um dentro do
-- contexto RLS correto (TenantPrismaService.run por tenant), o role da
-- aplicacao passa a precisar de LEITURA (nunca escrita) em "tenant". Uma
-- linha de "tenant" (id, razao_social, status, criado_em) nao expoe dado
-- sensivel de nenhum tenant especifico - so a existencia/nome de cada
-- cliente da plataforma, entao liberar SELECT para todo mundo autenticado
-- como `crm_app` (sem WITH CHECK, entao INSERT/UPDATE/DELETE continuam
-- bloqueados por padrao - bootstrap de Tenant continua exclusivamente
-- administrativo) e um custo aceitavel para fechar essa lacuna.
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_leitura_app" ON "tenant"
    FOR SELECT
    USING (true);
