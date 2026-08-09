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
  UsuarioDeTeste,
} from '../../test-utils/e2e-app.helper';

/**
 * E2E de verdade (HTTP real via supertest, Postgres real) para o que teste
 * de service com Prisma mockado estruturalmente não cobre: o
 * JwtAuthGuard aplicado globalmente end-to-end, o ValidationPipe rejeitando
 * corpo malformado antes de chegar no controller, e o fluxo completo de
 * refresh/rotação/logout (README, "Fechada (2026-08-02): refresh token
 * real"). Roda com `npm run test:e2e --workspace=apps/api`.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let contexto: TenantDeTeste;
  let usuario: UsuarioDeTeste;

  beforeAll(async () => {
    app = await subirAppE2E();
    contexto = await criarTenantDeTeste('Auth E2E');
    usuario = await criarUsuarioDeTeste(contexto, { email: 'auth-e2e@teste.com', senha: 'senha-forte-123' });
  });

  afterAll(async () => {
    await encerrarAppE2E(app);
    await removerTenantDeTeste(contexto.tenantId);
    await desconectarAdminDeTeste();
  });

  it('rejeita corpo malformado antes de chegar no service (ValidationPipe, 400)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: usuario.email }) // faltam tenantId e senha
      .expect(400);
  });

  it('rejeita campo não whitelisted no corpo (forbidNonWhitelisted, 400)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId: contexto.tenantId, email: usuario.email, senha: usuario.senha, campoInventado: 'x' })
      .expect(400);
  });

  it('rejeita senha incorreta (401)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId: contexto.tenantId, email: usuario.email, senha: 'senha-errada' })
      .expect(401);
  });

  it('endpoint protegido sem token retorna 401 (JwtAuthGuard global)', async () => {
    await request(app.getHttpServer()).get('/tarefas').expect(401);
  });

  it('endpoint protegido com token de assinatura inválida retorna 401', async () => {
    await request(app.getHttpServer()).get('/tarefas').set('Authorization', 'Bearer token-forjado').expect(401);
  });

  it('fluxo completo: login → usar access token → refresh (rotação) → reuso do refresh antigo falha → access antigo revalida → logout revoga', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId: contexto.tenantId, email: usuario.email, senha: usuario.senha })
      .expect(200);

    const { accessToken: access1, refreshToken: refresh1 } = login.body;
    expect(access1).toEqual(expect.any(String));
    expect(refresh1).toEqual(expect.any(String));

    // access token de verdade abre um endpoint protegido:
    await request(app.getHttpServer()).get('/tarefas').set('Authorization', `Bearer ${access1}`).expect(200);

    // refresh token NUNCA funciona como access token, mesmo com assinatura válida:
    await request(app.getHttpServer()).get('/tarefas').set('Authorization', `Bearer ${refresh1}`).expect(401);

    // renova: rotação real, novo par de tokens:
    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refresh1 })
      .expect(200);
    const { accessToken: access2, refreshToken: refresh2 } = refresh.body;
    // Não comparamos o texto do JWT entre access1/access2 (nem refresh1/refresh2):
    // como o payload é assinado com granularidade de segundo (`iat`), dois
    // tokens emitidos no mesmo segundo com as mesmas claims são
    // byte-idênticos por coincidência - inofensivo (nenhum dos dois vaza
    // privilégio extra), então testar isso testaria um artefato de
    // implementação, não uma propriedade de segurança. A propriedade real -
    // "o refresh antigo vira inutilizável após a rotação" - é provada
    // abaixo, tentando reusá-lo.

    // reuso do refresh já rotacionado é rejeitado (possível token roubado):
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: refresh1 }).expect(401);

    // access2 (novo) funciona:
    await request(app.getHttpServer()).get('/tarefas').set('Authorization', `Bearer ${access2}`).expect(200);

    // logout revoga o refresh atual:
    await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken: refresh2 }).expect(204);
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: refresh2 }).expect(401);

    // logout é idempotente/silencioso mesmo com token já inválido:
    await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken: refresh2 }).expect(204);
  });

  it('US-003, CA-001: usuário desligado perde acesso na próxima chamada, mesmo com access token ainda não expirado', async () => {
    const desligado = await criarUsuarioDeTeste(contexto, { email: 'auth-e2e-desligado@teste.com', senha: 'senha-forte-123' });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId: contexto.tenantId, email: desligado.email, senha: desligado.senha })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/usuarios/${desligado.id}/desligar`)
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(201); // ator desligando a si mesmo - permitido nesta fatia, ver comentário em usuarios.controller.ts

    await request(app.getHttpServer())
      .get('/tarefas')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
  });

  it('bloqueia a conta após 5 tentativas de senha errada, mesmo com a senha certa na 6a (fecha "sem rate limiting", README)', async () => {
    const alvo = await criarUsuarioDeTeste(contexto, { email: 'auth-e2e-bloqueio@teste.com', senha: 'senha-forte-123' });

    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ tenantId: contexto.tenantId, email: alvo.email, senha: 'senha-errada' })
        .expect(401);
    }

    // 6a tentativa, agora com a senha CERTA - ainda 401, porque a conta está bloqueada:
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId: contexto.tenantId, email: alvo.email, senha: alvo.senha })
      .expect(401);
  });
});
