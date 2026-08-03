import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from './tenant-prisma.service';

// Bootstrap de Tenant so pode ser feito com o role administrador
// (MIGRATE_DATABASE_URL) - mesma limitacao documentada em README.md ("Como
// rodar localmente": "Crie um Tenant... via SQL, administrador"). Nao e uma
// lacuna do app: nenhum caminho de codigo em runtime cria Tenant via
// `crm_app` (grep confirmado) - o Supabase liga RLS sem politica em toda
// tabela nova por padrao (mesma descoberta documentada no README), e
// "tenant" nunca ganhou uma politica propria porque a aplicacao nunca
// precisa gravar nela.
const admin = new PrismaClient({ datasources: { db: { url: process.env.MIGRATE_DATABASE_URL } } });

/**
 * DEC-TEC-001 / ART-005, secao 8: Row-Level Security no PostgreSQL e a
 * garantia de ultima linha do isolamento multi-tenant - mesmo que um filtro
 * `where: { tenantId }` seja esquecido no codigo da aplicacao, o banco em si
 * nao deve devolver linha de outro tenant para a conexao `crm_app` (role sem
 * BYPASSRLS, ver .env.example). Ate esta rodada essa garantia so era provada
 * manualmente (script ad-hoc a cada mudanca de schema, ver README "Próximos
 * passos sugeridos") - este arquivo fecha essa pendencia com um teste real,
 * contra um Postgres de verdade (nao mockado), que roda separado da suite
 * unitaria (ver jest.integration.config.js) porque precisa de rede/banco.
 *
 * Uso: DATABASE_URL deve apontar para o mesmo Postgres com as migrations
 * aplicadas (ver README "Como rodar localmente"). Roda com
 * `npm run test:integration --workspace=apps/api`.
 */
describe('Isolamento de tenant via Row-Level Security (DEC-TEC-001)', () => {
  const prisma = new PrismaService();
  const tenantPrisma = new TenantPrismaService(prisma);

  let tenantAId: string;
  let tenantBId: string;
  let unidadeAId: string;
  let unidadeBId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await admin.$connect();

    const tenantA = await admin.tenant.create({ data: { razaoSocial: 'RLS Teste Tenant A' } });
    const tenantB = await admin.tenant.create({ data: { razaoSocial: 'RLS Teste Tenant B' } });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // A escrita em si ja passa pela policy (WITH CHECK) - so funciona porque
    // app.tenant_id (setado por TenantPrismaService.run) bate com o tenantId
    // do registro sendo inserido.
    const unidadeA = await tenantPrisma.run(tenantAId, (tx) =>
      tx.unidade.create({ data: { tenantId: tenantAId, nomeFantasia: 'Unidade RLS A' } }),
    );
    const unidadeB = await tenantPrisma.run(tenantBId, (tx) =>
      tx.unidade.create({ data: { tenantId: tenantBId, nomeFantasia: 'Unidade RLS B' } }),
    );
    unidadeAId = unidadeA.id;
    unidadeBId = unidadeB.id;
  });

  afterAll(async () => {
    // Limpeza: diferente dos tenants de demonstracao manual deixados em
    // outras rodadas deste projeto, este teste roda repetidamente (a cada
    // `npm run test:integration`) e nao deve acumular lixo no banco.
    await tenantPrisma.run(tenantAId, (tx) => tx.unidade.deleteMany({ where: { tenantId: tenantAId } }));
    await tenantPrisma.run(tenantBId, (tx) => tx.unidade.deleteMany({ where: { tenantId: tenantBId } }));
    await admin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  it('tenant A nunca ve linha do tenant B, mesmo consultando sem where de tenant', async () => {
    // Deliberadamente SEM `where: { tenantId }` - se so a aplicacao
    // protegesse o isolamento (e o RLS nao estivesse ativo/correto), esta
    // consulta vazaria a unidade do tenant B.
    const resultado = await tenantPrisma.run(tenantAId, (tx) => tx.unidade.findMany({}));

    const ids = resultado.map((u) => u.id);
    expect(ids).toContain(unidadeAId);
    expect(ids).not.toContain(unidadeBId);
  });

  it('tenant B nunca ve linha do tenant A (mesma prova, sentido oposto)', async () => {
    const resultado = await tenantPrisma.run(tenantBId, (tx) => tx.unidade.findMany({}));

    const ids = resultado.map((u) => u.id);
    expect(ids).toContain(unidadeBId);
    expect(ids).not.toContain(unidadeAId);
  });

  it('falha fechado: sem app.tenant_id setado, a policy nao devolve nenhuma linha (nunca "todas")', async () => {
    // Sem passar por TenantPrismaService.run - nenhuma transacao seta
    // set_config('app.tenant_id', ...), entao current_setting(..., true)
    // retorna NULL e `tenant_id = NULL` nunca e verdadeiro em SQL. Esse foi
    // o comportamento que investiguei manualmente nesta mesma sessao ao
    // rodar uma query administrativa sem contexto de tenant (retornou [],
    // nao um erro) - aqui fica como regressao permanente, nao so anotacao.
    const resultado = await prisma.unidade.findMany({ where: { id: { in: [unidadeAId, unidadeBId] } } });

    expect(resultado).toHaveLength(0);
  });

  it('prova a nivel de SQL bruto - nao e so filtro client-side do Prisma', async () => {
    // Mesma policy, verificada via SQL direto (nao passa pelo query builder
    // do Prisma) - garante que a garantia e do banco, nao um comportamento
    // acidental de como o Prisma monta a query.
    const resultado = await tenantPrisma.run(tenantAId, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM unidade WHERE id IN (${unidadeAId}, ${unidadeBId})`,
    );

    expect(resultado.map((r) => r.id)).toEqual([unidadeAId]);
  });
});
