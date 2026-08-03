#!/usr/bin/env node
/**
 * Gera o SQL completo de bootstrap de um tenant novo: Tenant + Unidade
 * (matriz) + primeiro usuário (GESTOR_UNIDADE) — sempre administrativo, de
 * propósito (ver README.md, "Como rodar localmente" e a migration
 * `rls_tenant_leitura_app`): a tabela `tenant` só tem política de RLS de
 * LEITURA para o papel `crm_app` usado pela API em runtime, nunca de
 * escrita — criar um tenant exige o papel `postgres` (administrador, via
 * SQL Editor do Supabase), o mesmo usado para rodar as migrations. Isso é
 * deliberado: criar um tenant é dar acesso a um cliente novo da
 * plataforma, uma operação rara e sensível — não expomos isso como
 * endpoint da API (decisão registrada, não um esquecimento).
 *
 * Uso: node apps/api/scripts/gerar-hash-senha.js \
 *   "Razão Social Ltda" "Unidade Matriz" "Nome do Gestor" "gestor@empresa.com" "senha-forte"
 *
 * Uso legado (só a senha, para um usuário em tenant/unidade já existentes):
 *   node apps/api/scripts/gerar-hash-senha.js "minha-senha-forte"
 */
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const argumentos = process.argv.slice(2);

if (argumentos.length === 1) {
  const [senha] = argumentos;
  const hash = bcrypt.hashSync(senha, 10);
  console.log(hash);
  console.log('\nExemplo de INSERT (rode no SQL Editor do Supabase, com o role administrador):');
  console.log(`
INSERT INTO usuario (id, tenant_id, unidade_id, nome, email, senha_hash, perfil, status)
VALUES (
  gen_random_uuid(),
  '<TENANT_ID>',
  '<UNIDADE_ID>',
  '<NOME DO GESTOR>',
  '<email@exemplo.com>',
  '${hash}',
  'GESTOR_UNIDADE',
  'ATIVO'
);
`);
  process.exit(0);
}

if (argumentos.length !== 5) {
  console.error(
    'Uso: node apps/api/scripts/gerar-hash-senha.js "Razão Social" "Unidade Matriz" "Nome do Gestor" "gestor@empresa.com" "senha-forte"' +
      '\nOu (legado, usuário avulso): node apps/api/scripts/gerar-hash-senha.js "minha-senha"',
  );
  process.exit(1);
}

const [razaoSocial, nomeFantasiaUnidade, nomeGestor, emailGestor, senha] = argumentos;

const tenantId = randomUUID();
const unidadeId = randomUUID();
const usuarioId = randomUUID();
const senhaHash = bcrypt.hashSync(senha, 10);

function sqlEscape(texto) {
  return texto.replace(/'/g, "''");
}

console.log(`
-- Bootstrap de tenant novo (rode no SQL Editor do Supabase, com o role
-- administrador/postgres - crm_app não tem permissão de escrita em
-- "tenant" nem "unidade" fora do contexto de app.tenant_id, de propósito).
-- Tudo em uma transação: se algo falhar, nada fica pela metade.

BEGIN;

INSERT INTO tenant (id, razao_social, status)
VALUES ('${tenantId}', '${sqlEscape(razaoSocial)}', 'ATIVO');

INSERT INTO unidade (id, tenant_id, nome_fantasia, status, e_matriz)
VALUES ('${unidadeId}', '${tenantId}', '${sqlEscape(nomeFantasiaUnidade)}', 'ATIVA', true);

INSERT INTO usuario (id, tenant_id, unidade_id, nome, email, senha_hash, perfil, status)
VALUES (
  '${usuarioId}',
  '${tenantId}',
  '${unidadeId}',
  '${sqlEscape(nomeGestor)}',
  '${sqlEscape(emailGestor)}',
  '${senhaHash}',
  'GESTOR_UNIDADE',
  'ATIVO'
);

COMMIT;

-- Para logar em /login: tenantId = '${tenantId}', email = '${emailGestor}'
`);
