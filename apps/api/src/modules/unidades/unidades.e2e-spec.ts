import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  criarTenantDeTeste,
  criarUsuarioDeTeste,
  desconectarAdminDeTeste,
  encerrarAppE2E,
  removerTenantDeTeste,
  subirAppE2E,
  TenantDeTeste,
} from '../../test-utils/e2e-app.helper';

/**
 * E2E de verdade (HTTP real, Postgres real) para US-001. Diferente de
 * tenant-isolation.integration-spec.ts (que prova RLS direto via Prisma,
 * sem HTTP), este teste prova a MESMA garantia de isolamento passando pela
 * pilha inteira: token JWT real de cada tenant → JwtAuthGuard →
 * CurrentTenant() → controller → service → RLS no banco. Roda com
 * `npm run test:e2e --workspace=apps/api`.
 */
describe('Unidades (e2e)', () => {
  let app: INestApplication;
  let tenantA: TenantDeTeste;
  let tenantB: TenantDeTeste;
  let tokenGestorA: string;
  let tokenGestorB: string;

  beforeAll(async () => {
    app = await subirAppE2E();
    tenantA = await criarTenantDeTeste('Unidades E2E Tenant A');
    tenantB = await criarTenantDeTeste('Unidades E2E Tenant B');

    const gestorA = await criarUsuarioDeTeste(tenantA, { email: 'unidades-e2e-a@teste.com', senha: 'senha-forte-123' });
    const gestorB = await criarUsuarioDeTeste(tenantB, { email: 'unidades-e2e-b@teste.com', senha: 'senha-forte-123' });

    const loginA = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId: tenantA.tenantId, email: gestorA.email, senha: gestorA.senha });
    tokenGestorA = loginA.body.accessToken;

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId: tenantB.tenantId, email: gestorB.email, senha: gestorB.senha });
    tokenGestorB = loginB.body.accessToken;
  });

  afterAll(async () => {
    await encerrarAppE2E(app);
    await removerTenantDeTeste(tenantA.tenantId);
    await removerTenantDeTeste(tenantB.tenantId);
    await desconectarAdminDeTeste();
  });

  it('CA-001/CA-002: rejeita nomeFantasia ausente (ValidationPipe, 400) antes de tocar o banco', async () => {
    await request(app.getHttpServer())
      .post('/unidades')
      .set('Authorization', `Bearer ${tokenGestorA}`)
      .send({})
      .expect(400);
  });

  it('cadastra a unidade dentro do próprio tenant, sinalizando possível duplicidade sem bloquear', async () => {
    const primeira = await request(app.getHttpServer())
      .post('/unidades')
      .set('Authorization', `Bearer ${tokenGestorA}`)
      .send({ nomeFantasia: 'Filial Centro' })
      .expect(201);
    expect(primeira.body.possivelDuplicidade).toBe(false);
    expect(primeira.body.unidade.tenantId).toBe(tenantA.tenantId);

    const duplicada = await request(app.getHttpServer())
      .post('/unidades')
      .set('Authorization', `Bearer ${tokenGestorA}`)
      .send({ nomeFantasia: 'Filial Centro' })
      .expect(201);
    expect(duplicada.body.possivelDuplicidade).toBe(true);
  });

  it('isolamento por tenant através da pilha HTTP inteira: gestor do tenant B nunca vê unidade do tenant A', async () => {
    await request(app.getHttpServer())
      .post('/unidades')
      .set('Authorization', `Bearer ${tokenGestorA}`)
      .send({ nomeFantasia: 'Só existe no tenant A' })
      .expect(201);

    const listaA = await request(app.getHttpServer())
      .get('/unidades')
      .set('Authorization', `Bearer ${tokenGestorA}`)
      .expect(200);
    const listaB = await request(app.getHttpServer())
      .get('/unidades')
      .set('Authorization', `Bearer ${tokenGestorB}`)
      .expect(200);

    const nomesA = listaA.body.map((u: { nomeFantasia: string }) => u.nomeFantasia);
    const nomesB = listaB.body.map((u: { nomeFantasia: string }) => u.nomeFantasia);
    expect(nomesA).toContain('Só existe no tenant A');
    expect(nomesB).not.toContain('Só existe no tenant A');
    // e a unidade-matriz de bootstrap (criada por criarTenantDeTeste) também nunca cruza:
    expect(listaB.body.some((u: { id: string }) => u.id === tenantA.unidadeId)).toBe(false);
  });
});
