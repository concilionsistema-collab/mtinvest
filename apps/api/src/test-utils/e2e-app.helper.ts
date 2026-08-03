import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';

// Mesma limitacao de bootstrap documentada em
// tenant-isolation.integration-spec.ts e no README ("Como rodar
// localmente"): Tenant novo so pode ser criado com o role administrador
// (MIGRATE_DATABASE_URL) - "tenant" nunca ganhou politica de RLS de
// escrita para o role da aplicacao, de proposito.
const admin = new PrismaClient({ datasources: { db: { url: process.env.MIGRATE_DATABASE_URL } } });

/** Sobe a aplicacao Nest inteira (todos os modulos reais, guard global incluido) com os mesmos pipes globais de main.ts - HTTP de verdade via supertest, nao um controller isolado. */
export async function subirAppE2E(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

/**
 * `app.close()` sozinho não para os jobs do SchedulerService (@Cron real,
 * ver README "SchedulerService") - o timer do `cron` por baixo do
 * @nestjs/schedule fica ativo mesmo após o módulo ser destruído, o Jest
 * força a saída do worker no fim da suíte ("failed to exit gracefully").
 * Inofensivo para o resultado do teste, mas evitável: para os jobs
 * explicitamente antes de fechar.
 */
export async function encerrarAppE2E(app: INestApplication): Promise<void> {
  const registry = app.get(SchedulerRegistry, { strict: false });
  registry.getCronJobs().forEach((job) => job.stop());
  await app.close();
}

export interface TenantDeTeste {
  tenantId: string;
  unidadeId: string;
}

// Unidade e criada via TenantPrismaService (role da aplicacao, DATABASE_URL)
// e nao via `admin` - mesma escolha deliberada do teste de isolamento RLS:
// "a escrita em si ja passa pela policy (WITH CHECK)", exercitando o mesmo
// caminho que o app usa em runtime, nao um atalho de superusuario.
export async function criarTenantDeTeste(nomeBase: string): Promise<TenantDeTeste> {
  await admin.$connect();
  const tenant = await admin.tenant.create({ data: { razaoSocial: `${nomeBase} (E2E)` } });

  const prismaService = new PrismaService();
  const tenantPrisma = new TenantPrismaService(prismaService);
  const unidade = await tenantPrisma.run(tenant.id, (tx) =>
    tx.unidade.create({ data: { tenantId: tenant.id, nomeFantasia: `${nomeBase} - Unidade`, eMatriz: true } }),
  );
  await prismaService.$disconnect();

  return { tenantId: tenant.id, unidadeId: unidade.id };
}

export interface UsuarioDeTeste {
  id: string;
  email: string;
  senha: string;
}

export async function criarUsuarioDeTeste(
  contexto: TenantDeTeste,
  opts: { email: string; senha: string; perfil?: 'GESTOR_UNIDADE' | 'CORRETOR' },
): Promise<UsuarioDeTeste> {
  const senhaHash = await bcrypt.hash(opts.senha, 4); // custo baixo - so testes, roda muitas vezes
  const prismaService = new PrismaService();
  const tenantPrisma = new TenantPrismaService(prismaService);
  const usuario = await tenantPrisma.run(contexto.tenantId, (tx) =>
    tx.usuario.create({
      data: {
        tenantId: contexto.tenantId,
        unidadeId: contexto.unidadeId,
        nome: 'Usuário E2E',
        email: opts.email,
        senhaHash,
        perfil: opts.perfil ?? 'GESTOR_UNIDADE',
        status: 'ATIVO',
      },
    }),
  );
  await prismaService.$disconnect();

  return { id: usuario.id, email: opts.email, senha: opts.senha };
}

/** Limpeza completa do tenant de teste - roda a cada suíte, não deve acumular lixo no banco (mesmo cuidado do teste de isolamento RLS). */
export async function removerTenantDeTeste(tenantId: string): Promise<void> {
  await admin.refreshToken.deleteMany({ where: { tenantId } });
  await admin.usuario.deleteMany({ where: { tenantId } });
  await admin.unidade.deleteMany({ where: { tenantId } });
  await admin.tenant.delete({ where: { id: tenantId } });
}

export async function desconectarAdminDeTeste(): Promise<void> {
  await admin.$disconnect();
}
