import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { LeadsService } from '../leads/leads.service';
import { ReservasService } from '../reservas/reservas.service';
import { CarteirasService } from '../carteiras/carteiras.service';
import { VistoriasService } from '../locacao/vistorias.service';
import { ContratosLocacaoService } from '../locacao/contratos-locacao.service';

// Cobre a troca dos agendadores "preguicosos" por um job real (README,
// "Próximos passos sugeridos").
describe('SchedulerService', () => {
  function criarServico(tenants: { id: string }[], falhaNoTenantId?: string) {
    const tenantFindMany = jest.fn().mockResolvedValue(tenants);
    const prisma = { tenant: { findMany: tenantFindMany } } as unknown as PrismaService;

    const tenantPrisma = {
      run: jest.fn((tenantId: string, work: (tx: unknown) => unknown) => {
        if (tenantId === falhaNoTenantId) {
          return Promise.reject(new Error(`falha simulada no tenant ${tenantId}`));
        }
        return work({});
      }),
    } as unknown as TenantPrismaService;

    const leadsService = { executarVarreduraAutomaticaTx: jest.fn().mockResolvedValue(undefined) } as unknown as LeadsService;
    const reservasService = { executarVarreduraAutomaticaTx: jest.fn().mockResolvedValue(undefined) } as unknown as ReservasService;
    const carteirasService = { executarVarreduraAutomaticaTx: jest.fn().mockResolvedValue(undefined) } as unknown as CarteirasService;
    const vistoriasService = { executarVarreduraAutomaticaTx: jest.fn().mockResolvedValue(undefined) } as unknown as VistoriasService;
    const contratosLocacaoService = { executarVarreduraAutomaticaTx: jest.fn().mockResolvedValue(undefined) } as unknown as ContratosLocacaoService;

    const service = new SchedulerService(prisma, tenantPrisma, leadsService, reservasService, carteirasService, vistoriasService, contratosLocacaoService);
    return { service, tenantFindMany, tenantPrisma, leadsService, reservasService, carteirasService, vistoriasService, contratosLocacaoService };
  }

  it('varre todos os tenants ATIVO, um por vez, dentro do contexto RLS de cada um', async () => {
    const { service, tenantFindMany, tenantPrisma, leadsService, reservasService, carteirasService, vistoriasService, contratosLocacaoService } = criarServico([
      { id: 'tenant-a' },
      { id: 'tenant-b' },
    ]);

    await service.executarVarreduraAutomatica();

    expect(tenantFindMany).toHaveBeenCalledWith({ where: { status: 'ATIVO' }, select: { id: true } });
    expect(tenantPrisma.run).toHaveBeenCalledWith('tenant-a', expect.any(Function));
    expect(tenantPrisma.run).toHaveBeenCalledWith('tenant-b', expect.any(Function));
    expect(leadsService.executarVarreduraAutomaticaTx).toHaveBeenCalledTimes(2);
    expect(reservasService.executarVarreduraAutomaticaTx).toHaveBeenCalledTimes(2);
    expect(carteirasService.executarVarreduraAutomaticaTx).toHaveBeenCalledTimes(2);
    expect(vistoriasService.executarVarreduraAutomaticaTx).toHaveBeenCalledTimes(2);
    expect(contratosLocacaoService.executarVarreduraAutomaticaTx).toHaveBeenCalledTimes(2);
    expect(leadsService.executarVarreduraAutomaticaTx).toHaveBeenCalledWith(expect.anything(), 'tenant-a');
    expect(leadsService.executarVarreduraAutomaticaTx).toHaveBeenCalledWith(expect.anything(), 'tenant-b');
  });

  it('falha em um tenant nao impede a varredura dos demais', async () => {
    const { service, leadsService } = criarServico([{ id: 'tenant-com-falha' }, { id: 'tenant-ok' }], 'tenant-com-falha');

    await expect(service.executarVarreduraAutomatica()).resolves.toBeUndefined();

    // so o tenant-ok chegou a rodar a varredura de negocio:
    expect(leadsService.executarVarreduraAutomaticaTx).toHaveBeenCalledTimes(1);
    expect(leadsService.executarVarreduraAutomaticaTx).toHaveBeenCalledWith(expect.anything(), 'tenant-ok');
  });

  it('sem tenants ATIVO, nao chama nenhuma varredura', async () => {
    const { service, leadsService, reservasService, carteirasService } = criarServico([]);

    await service.executarVarreduraAutomatica();

    expect(leadsService.executarVarreduraAutomaticaTx).not.toHaveBeenCalled();
    expect(reservasService.executarVarreduraAutomaticaTx).not.toHaveBeenCalled();
    expect(carteirasService.executarVarreduraAutomaticaTx).not.toHaveBeenCalled();
  });
});
