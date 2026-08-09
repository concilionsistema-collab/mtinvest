import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

// Cobre o endpoint de liveness/readiness (nao especificado em nenhum
// artefato - item basico de prontidao operacional).
describe('HealthController', () => {
  function criarController(queryRawImpl: () => Promise<unknown>) {
    const prisma = { $queryRaw: jest.fn(queryRawImpl) } as unknown as PrismaService;
    return { controller: new HealthController(prisma), prisma };
  }

  it('retorna status ok quando o banco responde', async () => {
    const { controller } = criarController(() => Promise.resolve([{ '?column?': 1 }]));

    const resultado = await controller.verificar();

    expect(resultado.status).toBe('ok');
    expect(resultado.database).toBe('ok');
    expect(typeof resultado.timestamp).toBe('string');
  });

  it('lanca ServiceUnavailableException quando o banco esta inacessivel', async () => {
    const { controller } = criarController(() => Promise.reject(new Error('connection refused')));

    await expect(controller.verificar()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
