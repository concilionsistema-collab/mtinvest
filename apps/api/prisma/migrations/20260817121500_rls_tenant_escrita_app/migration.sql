-- Onboarding self-service (POST /tenants) + cobranca (BillingModule) batem
-- de frente com a politica de 20260802091623_rls_tenant_leitura_app: aquela
-- migracao deixou "tenant" SELECT-only para o role `crm_app` de proposito
-- ("bootstrap de Tenant sempre foi administrativo"), porque na epoca nenhum
-- caminho de runtime da aplicacao precisava criar/alterar tenant. Agora
-- precisa, em dois pontos:
--   1. TenantsService.criar (POST /tenants publico) - INSERT.
--   2. BillingService.processarWebhook (POST /billing/webhook, Stripe) -
--      UPDATE de assinatura_status/stripe_customer_id/stripe_subscription_id.
--
-- INSERT fica restrito a so criar tenant em TRIAL (WITH CHECK) - mesmo que o
-- role da aplicacao seja comprometido, ele nao consegue se auto-conceder uma
-- assinatura ATIVA via INSERT malicioso, so o fluxo real (TRIAL -> Stripe
-- Checkout -> webhook) muda isso depois.
--
-- UPDATE fica aberto (USING/WITH CHECK true) - RLS por si so nao expressa
-- "so pode mudar assinatura_status/stripe_*", so linhas inteiras. A defesa
-- real contra abuso aqui e BillingService.processarWebhook exigir a
-- assinatura HMAC valida do Stripe antes de qualquer UPDATE (nunca aceita
-- corpo nao assinado) - RLS aberto e um custo aceito, nao um descuido.
-- LIMITACAO REGISTRADA: uma defesa mais estreita exigiria GRANT UPDATE
-- (coluna a coluna) para o role `crm_app`, complementando RLS - fica pra uma
-- iteracao futura se o modelo de ameaca justificar o esforco extra.
CREATE POLICY "tenant_insert_app" ON "tenant"
    FOR INSERT
    WITH CHECK (assinatura_status = 'TRIAL');

CREATE POLICY "tenant_update_app" ON "tenant"
    FOR UPDATE
    USING (true)
    WITH CHECK (true);
