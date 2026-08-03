import { NotFoundException } from '@nestjs/common';
import { TarefasService } from './tarefas.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

// EXTENSAO REGISTRADA: ver comentario em tarefas.service.ts.
describe('TarefasService', () => {
  const tenantId = 'tenant-1';

  function criarServicoComTx(tx: {
    tarefaCreate?: jest.Mock;
    tarefaFindMany?: jest.Mock;
    tarefaFindFirst?: jest.Mock;
    tarefaUpdate?: jest.Mock;
    tarefaDelete?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          tarefa: {
            create: tx.tarefaCreate,
            findMany: tx.tarefaFindMany,
            findFirst: tx.tarefaFindFirst,
            update: tx.tarefaUpdate,
            delete: tx.tarefaDelete,
          },
        }),
      ),
    } as unknown as TenantPrismaService;

    return new TarefasService(tenantPrisma);
  }

  const tarefaBase = {
    id: 't1',
    tenantId,
    usuarioId: 'usr1',
    titulo: 'Ligar para o lead',
    concluida: false,
    prazo: null,
    criadoEm: new Date('2026-08-01T00:00:00.000Z'),
  };

  describe('criar', () => {
    it('cria a tarefa vinculada ao usuario chamador, sem prazo', async () => {
      const tarefaCreate = jest.fn().mockResolvedValue(tarefaBase);
      const service = criarServicoComTx({ tarefaCreate });

      const resultado = await service.criar(tenantId, 'usr1', { titulo: 'Ligar para o lead' });

      expect(tarefaCreate).toHaveBeenCalledWith({
        data: { tenantId, usuarioId: 'usr1', titulo: 'Ligar para o lead', prazo: null },
      });
      expect(resultado.concluida).toBe(false);
    });

    it('converte o prazo informado para Date', async () => {
      const tarefaCreate = jest.fn().mockResolvedValue(tarefaBase);
      const service = criarServicoComTx({ tarefaCreate });

      await service.criar(tenantId, 'usr1', { titulo: 'Ligar', prazo: '2026-08-10T12:00:00.000Z' });

      expect(tarefaCreate).toHaveBeenCalledWith({
        data: { tenantId, usuarioId: 'usr1', titulo: 'Ligar', prazo: new Date('2026-08-10T12:00:00.000Z') },
      });
    });
  });

  describe('listar (sempre pessoal)', () => {
    it('lista so as tarefas do proprio chamador', async () => {
      const tarefaFindMany = jest.fn().mockResolvedValue([tarefaBase]);
      const service = criarServicoComTx({ tarefaFindMany });

      const resultado = await service.listar(tenantId, 'usr1');

      expect(tarefaFindMany).toHaveBeenCalledWith({
        where: { tenantId, usuarioId: 'usr1' },
        orderBy: [{ concluida: 'asc' }, { prazo: 'asc' }, { criadoEm: 'desc' }],
      });
      expect(resultado).toHaveLength(1);
    });
  });

  describe('concluir/reabrir', () => {
    it('marca como concluida quando a tarefa pertence ao chamador', async () => {
      const tarefaFindFirst = jest.fn().mockResolvedValue(tarefaBase);
      const tarefaUpdate = jest.fn().mockResolvedValue({ ...tarefaBase, concluida: true });
      const service = criarServicoComTx({ tarefaFindFirst, tarefaUpdate });

      const resultado = await service.concluir(tenantId, 'usr1', 't1');

      expect(tarefaFindFirst).toHaveBeenCalledWith({ where: { id: 't1', tenantId, usuarioId: 'usr1' } });
      expect(tarefaUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { concluida: true } });
      expect(resultado.concluida).toBe(true);
    });

    it('rejeita (404) quando a tarefa nao pertence ao chamador', async () => {
      const tarefaFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ tarefaFindFirst });

      await expect(service.concluir(tenantId, 'outro-usuario', 't1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reabrir volta concluida para false', async () => {
      const tarefaFindFirst = jest.fn().mockResolvedValue({ ...tarefaBase, concluida: true });
      const tarefaUpdate = jest.fn().mockResolvedValue({ ...tarefaBase, concluida: false });
      const service = criarServicoComTx({ tarefaFindFirst, tarefaUpdate });

      const resultado = await service.reabrir(tenantId, 'usr1', 't1');

      expect(tarefaUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { concluida: false } });
      expect(resultado.concluida).toBe(false);
    });
  });

  describe('remover', () => {
    it('remove a tarefa quando pertence ao chamador', async () => {
      const tarefaFindFirst = jest.fn().mockResolvedValue(tarefaBase);
      const tarefaDelete = jest.fn().mockResolvedValue(tarefaBase);
      const service = criarServicoComTx({ tarefaFindFirst, tarefaDelete });

      await service.remover(tenantId, 'usr1', 't1');

      expect(tarefaDelete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('rejeita (404) quando a tarefa nao pertence ao chamador', async () => {
      const tarefaFindFirst = jest.fn().mockResolvedValue(null);
      const tarefaDelete = jest.fn();
      const service = criarServicoComTx({ tarefaFindFirst, tarefaDelete });

      await expect(service.remover(tenantId, 'outro-usuario', 't1')).rejects.toBeInstanceOf(NotFoundException);
      expect(tarefaDelete).not.toHaveBeenCalled();
    });
  });
});
