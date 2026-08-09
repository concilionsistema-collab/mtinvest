import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReajustesService } from './reajustes.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

function decimal(valor: number) {
  return new Prisma.Decimal(valor);
}

// Cobre US-108 (ART-015-backlog-fase-2.md) / RN-406, RN-407 (ART-010).
describe('ReajustesService', () => {
  const tenantId = 'tenant-1';
  const unidadeId = 'un-A';
  const gestor: UsuarioAutenticado = { id: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'usr2', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR' };

  function criarServicoComTx(tx: {
    contratoDeLocacaoFindFirst?: jest.Mock;
    contratoDeLocacaoUpdate?: jest.Mock;
    reajusteFindFirst?: jest.Mock;
    reajusteCreate?: jest.Mock;
    reajusteFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          contratoDeLocacao: { findFirst: tx.contratoDeLocacaoFindFirst, update: tx.contratoDeLocacaoUpdate },
          reajuste: { findFirst: tx.reajusteFindFirst, create: tx.reajusteCreate, findMany: tx.reajusteFindMany },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);

    return { service: new ReajustesService(tenantPrisma, auditoriaService) };
  }

  const contratoVigente = {
    id: 'cl1',
    tenantId,
    estado: 'VIGENTE',
    valorAluguel: decimal(2000),
    indiceReajuste: 'IGPM',
    aceitaReajusteNegativo: false,
  };

  const reajusteCriado = {
    id: 'rj1',
    tenantId,
    contratoDeLocacaoId: 'cl1',
    competencia: '2026-08',
    indice: 'IGPM',
    percentualIndice: decimal(5),
    percentualAplicado: decimal(5),
    valorAluguelAnterior: decimal(2000),
    valorAluguelNovo: decimal(2100),
    criadoEm: new Date('2026-08-06T00:00:00.000Z'),
  };

  describe('aplicar', () => {
    it('CORRETOR nao pode aplicar reajuste (so GESTOR_UNIDADE)', async () => {
      const { service } = criarServicoComTx({});

      await expect(
        service.aplicar(tenantId, corretor, 'cl1', { competencia: '2026-08', percentualIndice: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('aplica reajuste positivo e atualiza o valor do aluguel do contrato', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const reajusteFindFirst = jest.fn().mockResolvedValue(null);
      const reajusteCreate = jest.fn().mockResolvedValue(reajusteCriado);
      const contratoDeLocacaoUpdate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({
        contratoDeLocacaoFindFirst,
        reajusteFindFirst,
        reajusteCreate,
        contratoDeLocacaoUpdate,
      });

      const resultado = await service.aplicar(tenantId, gestor, 'cl1', { competencia: '2026-08', percentualIndice: 5 });

      expect(reajusteCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          contratoDeLocacaoId: 'cl1',
          competencia: '2026-08',
          indice: 'IGPM',
          percentualIndice: 5,
          percentualAplicado: 5,
          valorAluguelAnterior: 2000,
          valorAluguelNovo: 2100,
        },
      });
      expect(contratoDeLocacaoUpdate).toHaveBeenCalledWith({ where: { id: 'cl1' }, data: { valorAluguel: 2100 } });
      expect(resultado.valorAluguelNovo).toBe(2100);
    });

    it('RN-407: deflacao aplica piso zero quando o contrato nao aceita reajuste negativo', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const reajusteFindFirst = jest.fn().mockResolvedValue(null);
      const reajusteCreate = jest.fn().mockResolvedValue({ ...reajusteCriado, percentualAplicado: decimal(0) });
      const contratoDeLocacaoUpdate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({
        contratoDeLocacaoFindFirst,
        reajusteFindFirst,
        reajusteCreate,
        contratoDeLocacaoUpdate,
      });

      await service.aplicar(tenantId, gestor, 'cl1', { competencia: '2026-08', percentualIndice: -3 });

      expect(reajusteCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ percentualIndice: -3, percentualAplicado: 0, valorAluguelNovo: 2000 }),
      });
      expect(contratoDeLocacaoUpdate).toHaveBeenCalledWith({ where: { id: 'cl1' }, data: { valorAluguel: 2000 } });
    });

    it('RN-407: deflacao e aplicada integralmente quando o contrato aceita reajuste negativo', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ ...contratoVigente, aceitaReajusteNegativo: true });
      const reajusteFindFirst = jest.fn().mockResolvedValue(null);
      const reajusteCreate = jest.fn().mockResolvedValue(reajusteCriado);
      const contratoDeLocacaoUpdate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({
        contratoDeLocacaoFindFirst,
        reajusteFindFirst,
        reajusteCreate,
        contratoDeLocacaoUpdate,
      });

      await service.aplicar(tenantId, gestor, 'cl1', { competencia: '2026-08', percentualIndice: -3 });

      expect(reajusteCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ percentualIndice: -3, percentualAplicado: -3, valorAluguelNovo: 1940 }),
      });
    });

    it('rejeita aplicar reajuste em contrato que nao esta VIGENTE', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ ...contratoVigente, estado: 'RASCUNHO' });
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(
        service.aplicar(tenantId, gestor, 'cl1', { competencia: '2026-08', percentualIndice: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('RN-406: rejeita reaplicar a mesma competencia (nunca recalculado retroativamente)', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const reajusteFindFirst = jest.fn().mockResolvedValue(reajusteCriado);
      const reajusteCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, reajusteFindFirst, reajusteCreate });

      await expect(
        service.aplicar(tenantId, gestor, 'cl1', { competencia: '2026-08', percentualIndice: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(reajusteCreate).not.toHaveBeenCalled();
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(
        service.aplicar(tenantId, gestor, 'cl-outro-tenant', { competencia: '2026-08', percentualIndice: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar', () => {
    it('lista os reajustes do contrato ordenados por competencia desc', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const reajusteFindMany = jest.fn().mockResolvedValue([reajusteCriado]);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, reajusteFindMany });

      const resultado = await service.listar(tenantId, unidadeId, 'cl1');

      expect(reajusteFindMany).toHaveBeenCalledWith({
        where: { tenantId, contratoDeLocacaoId: 'cl1' },
        orderBy: { competencia: 'desc' },
      });
      expect(resultado).toHaveLength(1);
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(service.listar(tenantId, unidadeId, 'cl-outro-tenant')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
