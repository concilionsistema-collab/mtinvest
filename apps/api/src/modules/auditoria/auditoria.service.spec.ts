import { AuditoriaService } from './auditoria.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

// Cobre a infraestrutura de RegistroDeAuditoria (ART-005, seção 7: append-only).
describe('AuditoriaService', () => {
  const tenantId = 'tenant-1';

  it('registrarTx grava dentro da transacao recebida (nunca abre a propria)', async () => {
    const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
    const tx = { registroDeAuditoria: { create: registroDeAuditoriaCreate } } as never;
    const tenantPrisma = { run: jest.fn() } as unknown as TenantPrismaService;
    const service = new AuditoriaService(tenantPrisma);

    await service.registrarTx(tx, tenantId, 'usr1', 'ACAO_TESTE', 'Entidade', 'ent1', 'motivo opcional');

    expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
      data: { tenantId, atorUsuarioId: 'usr1', acao: 'ACAO_TESTE', entidadeTipo: 'Entidade', entidadeId: 'ent1', motivo: 'motivo opcional' },
    });
    // nao deve ter aberto uma transacao propria via tenantPrisma.run:
    expect(tenantPrisma.run).not.toHaveBeenCalled();
  });

  it('listar filtra por tenant, entidadeTipo e entidadeId quando informados', async () => {
    const registroDeAuditoriaFindMany = jest.fn().mockResolvedValue([
      {
        id: 'reg1',
        tenantId,
        atorUsuarioId: 'usr1',
        acao: 'ACAO_TESTE',
        entidadeTipo: 'Entidade',
        entidadeId: 'ent1',
        motivo: null,
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({ registroDeAuditoria: { findMany: registroDeAuditoriaFindMany } }),
      ),
    } as unknown as TenantPrismaService;
    const service = new AuditoriaService(tenantPrisma);

    const resultado = await service.listar(tenantId, 'Entidade', 'ent1');

    expect(registroDeAuditoriaFindMany).toHaveBeenCalledWith({
      where: { tenantId, entidadeTipo: 'Entidade', entidadeId: 'ent1' },
      orderBy: { criadoEm: 'desc' },
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].acao).toBe('ACAO_TESTE');
  });

  it('listar sem filtros retorna toda a trilha do tenant', async () => {
    const registroDeAuditoriaFindMany = jest.fn().mockResolvedValue([]);
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({ registroDeAuditoria: { findMany: registroDeAuditoriaFindMany } }),
      ),
    } as unknown as TenantPrismaService;
    const service = new AuditoriaService(tenantPrisma);

    await service.listar(tenantId);

    expect(registroDeAuditoriaFindMany).toHaveBeenCalledWith({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
    });
  });
});
