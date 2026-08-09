import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RenovacoesService } from './renovacoes.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

// Cobre US-109 (ART-015-backlog-fase-2.md) / RN-408, RN-412 (ART-010).
describe('RenovacoesService', () => {
  const tenantId = 'tenant-1';
  const unidadeId = 'un-A';
  const gestor: UsuarioAutenticado = { id: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'usr2', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR' };

  function criarServicoComTx(tx: {
    contratoDeLocacaoFindFirst?: jest.Mock;
    contratoDeLocacaoUpdate?: jest.Mock;
    renovacaoCreate?: jest.Mock;
    renovacaoFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          contratoDeLocacao: { findFirst: tx.contratoDeLocacaoFindFirst, update: tx.contratoDeLocacaoUpdate },
          renovacao: { create: tx.renovacaoCreate, findMany: tx.renovacaoFindMany },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);
    return { service: new RenovacoesService(tenantPrisma, auditoriaService) };
  }

  const contratoVigente = {
    id: 'cl1',
    tenantId,
    estado: 'VIGENTE',
    vencimentoAtual: new Date('2027-08-01T00:00:00.000Z'),
  };

  const renovacaoCriada = {
    id: 'rn1',
    tenantId,
    contratoDeLocacaoId: 'cl1',
    prazoAdicionalMeses: 12,
    vencimentoAnterior: new Date('2027-08-01T00:00:00.000Z'),
    novoVencimento: new Date('2028-08-01T00:00:00.000Z'),
    confirmadoPorUsuarioId: gestor.id,
    criadoEm: new Date('2026-08-06T00:00:00.000Z'),
  };

  describe('confirmar', () => {
    it('CORRETOR nao pode confirmar renovacao (so GESTOR_UNIDADE)', async () => {
      const { service } = criarServicoComTx({});

      await expect(service.confirmar(tenantId, corretor, 'cl1', { prazoAdicionalMeses: 12 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('confirma a renovacao e estende vencimentoAtual do contrato', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const renovacaoCreate = jest.fn().mockResolvedValue(renovacaoCriada);
      const contratoDeLocacaoUpdate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, renovacaoCreate, contratoDeLocacaoUpdate });

      const resultado = await service.confirmar(tenantId, gestor, 'cl1', { prazoAdicionalMeses: 12 });

      expect(renovacaoCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          contratoDeLocacaoId: 'cl1',
          prazoAdicionalMeses: 12,
          vencimentoAnterior: new Date('2027-08-01T00:00:00.000Z'),
          novoVencimento: new Date('2028-08-01T00:00:00.000Z'),
          confirmadoPorUsuarioId: gestor.id,
        },
      });
      expect(contratoDeLocacaoUpdate).toHaveBeenCalledWith({
        where: { id: 'cl1' },
        data: { vencimentoAtual: new Date('2028-08-01T00:00:00.000Z') },
      });
      expect(resultado.novoVencimento).toBe('2028-08-01');
    });

    it('rejeita confirmar renovacao de contrato que nao esta VIGENTE', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ ...contratoVigente, estado: 'EM_ENCERRAMENTO' });
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(service.confirmar(tenantId, gestor, 'cl1', { prazoAdicionalMeses: 12 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(
        service.confirmar(tenantId, gestor, 'cl-outro-tenant', { prazoAdicionalMeses: 12 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar', () => {
    it('lista as renovacoes do contrato', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const renovacaoFindMany = jest.fn().mockResolvedValue([renovacaoCriada]);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, renovacaoFindMany });

      const resultado = await service.listar(tenantId, unidadeId, 'cl1');

      expect(renovacaoFindMany).toHaveBeenCalledWith({
        where: { tenantId, contratoDeLocacaoId: 'cl1' },
        orderBy: { criadoEm: 'desc' },
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
