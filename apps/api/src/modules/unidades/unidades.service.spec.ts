import { UnidadesService } from './unidades.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

// Cobre US-001 / CA-001 e CA-002 de ART-014.
describe('UnidadesService', () => {
  const tenantId = 'tenant-1';

  function criarServicoComTx(tx: {
    findFirst: jest.Mock;
    create: jest.Mock;
    findMany?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({ unidade: tx }),
      ),
    } as unknown as TenantPrismaService;

    return { service: new UnidadesService(tenantPrisma), tenantPrisma };
  }

  it('CA-001: cria a unidade vinculada ao tenant do requisitante', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'u1',
      tenantId,
      nomeFantasia: 'Imobiliaria Centro',
      status: 'ATIVA',
      eMatriz: false,
      criadoEm: new Date('2026-07-31T00:00:00.000Z'),
    });
    const findFirst = jest.fn().mockResolvedValue(null);
    const { service, tenantPrisma } = criarServicoComTx({ findFirst, create });

    const resultado = await service.criar(tenantId, { nomeFantasia: 'Imobiliaria Centro' });

    expect(tenantPrisma.run).toHaveBeenCalledWith(tenantId, expect.any(Function));
    expect(create).toHaveBeenCalledWith({
      data: { tenantId, nomeFantasia: 'Imobiliaria Centro', eMatriz: false },
    });
    expect(resultado.unidade.tenantId).toBe(tenantId);
    expect(resultado.possivelDuplicidade).toBe(false);
  });

  it('CA-002: alerta duplicidade de nome sem bloquear o cadastro', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'u2',
      tenantId,
      nomeFantasia: 'Imobiliaria Centro',
      status: 'ATIVA',
      eMatriz: false,
      criadoEm: new Date('2026-07-31T00:00:00.000Z'),
    });
    const findFirst = jest.fn().mockResolvedValue({ id: 'u1' });
    const { service } = criarServicoComTx({ findFirst, create });

    const resultado = await service.criar(tenantId, { nomeFantasia: 'Imobiliaria Centro' });

    expect(create).toHaveBeenCalled();
    expect(resultado.possivelDuplicidade).toBe(true);
  });
});
