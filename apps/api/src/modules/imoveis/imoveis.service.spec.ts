import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImoveisService } from './imoveis.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-004, US-005 e RN-005/RN-006 (ART-004) de ART-014.
describe('ImoveisService', () => {
  const tenantId = 'tenant-1';
  const atorUsuarioId = 'usr1';

  interface TxMocks {
    unidadeFindFirst?: jest.Mock;
    imovelCreate?: jest.Mock;
    imovelFindFirst?: jest.Mock;
    imovelFindMany?: jest.Mock;
    imovelUpdate?: jest.Mock;
    compartilhamentoCreate?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }

  function criarServicoComTx(tx: TxMocks) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          unidade: { findFirst: tx.unidadeFindFirst },
          imovel: {
            create: tx.imovelCreate,
            findFirst: tx.imovelFindFirst,
            findMany: tx.imovelFindMany,
            update: tx.imovelUpdate,
          },
          compartilhamentoDeImovel: { create: tx.compartilhamentoCreate },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    return { service: new ImoveisService(tenantPrisma, new AuditoriaService(tenantPrisma)), tenantPrisma };
  }

  const imovelBase = {
    id: 'i1',
    tenantId,
    unidadeProprietariaId: 'u1',
    finalidade: 'VENDA',
    enderecoResumo: 'Rua Teste, 123',
    escopoCompartilhamento: null,
    criadoEm: new Date('2026-07-31T00:00:00.000Z'),
  };

  describe('criar (US-004)', () => {
    it('CA-001: registra a unidade proprietaria como a unidade informada, dentro do tenant', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: 'u1', tenantId });
      const imovelCreate = jest
        .fn()
        .mockResolvedValue({ ...imovelBase, estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE' });
      const { service } = criarServicoComTx({ unidadeFindFirst, imovelCreate });

      const imovel = await service.criar(tenantId, {
        unidadeProprietariaId: 'u1',
        finalidade: 'VENDA',
        enderecoResumo: 'Rua Teste, 123',
      });

      expect(unidadeFindFirst).toHaveBeenCalledWith({ where: { id: 'u1', tenantId } });
      expect(imovel.unidadeProprietariaId).toBe('u1');
      expect(imovel.estadoCompartilhamento).toBe('EXCLUSIVO_DA_UNIDADE');
    });

    it('rejeita captacao para unidade que nao pertence ao tenant do requisitante', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue(null);
      const imovelCreate = jest.fn();
      const { service } = criarServicoComTx({ unidadeFindFirst, imovelCreate });

      await expect(
        service.criar(tenantId, {
          unidadeProprietariaId: 'unidade-de-outro-tenant',
          finalidade: 'VENDA',
          enderecoResumo: 'Rua Teste, 123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(imovelCreate).not.toHaveBeenCalled();
    });
  });

  describe('listar (visibilidade por unidade, RN-005/RN-006)', () => {
    it('escopa a query pela unidade proprietaria OU compartilhado - nunca o tenant inteiro sem filtro', async () => {
      const imovelFindMany = jest.fn().mockResolvedValue([]);
      const { service } = criarServicoComTx({ imovelFindMany });

      await service.listar(tenantId, 'u1');

      expect(imovelFindMany).toHaveBeenCalledWith({
        where: { tenantId, OR: [{ unidadeProprietariaId: 'u1' }, { estadoCompartilhamento: 'COMPARTILHADO' }] },
        orderBy: { criadoEm: 'asc' },
      });
    });

    it('retorna imovel exclusivo da propria unidade e imovel compartilhado de outra unidade', async () => {
      const imovelFindMany = jest.fn().mockResolvedValue([
        { ...imovelBase, id: 'i1', unidadeProprietariaId: 'u1', estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE' },
        { ...imovelBase, id: 'i2', unidadeProprietariaId: 'u2-outra-unidade', estadoCompartilhamento: 'COMPARTILHADO' },
      ]);
      const { service } = criarServicoComTx({ imovelFindMany });

      const resultado = await service.listar(tenantId, 'u1');

      expect(resultado.map((i) => i.id)).toEqual(['i1', 'i2']);
    });
  });

  describe('compartilhar e revogarCompartilhamento (US-005)', () => {
    it('compartilha um imovel exclusivo e registra o evento no historico', async () => {
      const imovelFindFirst = jest
        .fn()
        .mockResolvedValue({ ...imovelBase, estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE' });
      const imovelUpdate = jest.fn().mockResolvedValue({
        ...imovelBase,
        estadoCompartilhamento: 'COMPARTILHADO',
        escopoCompartilhamento: 'REDE',
      });
      const compartilhamentoCreate = jest.fn().mockResolvedValue({});
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({
        imovelFindFirst,
        imovelUpdate,
        compartilhamentoCreate,
        registroDeAuditoriaCreate,
      });

      const imovel = await service.compartilhar(tenantId, 'i1', { escopoCompartilhamento: 'REDE' }, atorUsuarioId);

      expect(imovel.estadoCompartilhamento).toBe('COMPARTILHADO');
      expect(imovel.escopoCompartilhamento).toBe('REDE');
      expect(compartilhamentoCreate).toHaveBeenCalledWith({
        data: { tenantId, imovelId: 'i1', evento: 'COMPARTILHADO' },
      });
      // ART-005, secao 9: escrita em Imovel.estadoCompartilhamento gera RegistroDeAuditoria.
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId,
          acao: 'IMOVEL_COMPARTILHADO',
          entidadeTipo: 'Imovel',
          entidadeId: 'i1',
          motivo: 'escopo=REDE',
        },
      });
    });

    it('rejeita compartilhar um imovel que ja nao esta exclusivo da unidade', async () => {
      const imovelFindFirst = jest
        .fn()
        .mockResolvedValue({ ...imovelBase, estadoCompartilhamento: 'COMPARTILHADO' });
      const imovelUpdate = jest.fn();
      const compartilhamentoCreate = jest.fn();
      const { service } = criarServicoComTx({ imovelFindFirst, imovelUpdate, compartilhamentoCreate });

      await expect(
        service.compartilhar(tenantId, 'i1', { escopoCompartilhamento: 'REDE' }, atorUsuarioId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(imovelUpdate).not.toHaveBeenCalled();
    });

    it('imovel de outro tenant nao e encontrado (404, nao vazamento de dado)', async () => {
      const imovelFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ imovelFindFirst });

      await expect(
        service.compartilhar(tenantId, 'i-de-outro-tenant', { escopoCompartilhamento: 'REDE' }, atorUsuarioId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revoga um compartilhamento ativo e volta ao estado exclusivo', async () => {
      const imovelFindFirst = jest.fn().mockResolvedValue({
        ...imovelBase,
        estadoCompartilhamento: 'COMPARTILHADO',
        escopoCompartilhamento: 'REDE',
      });
      const imovelUpdate = jest.fn().mockResolvedValue({
        ...imovelBase,
        estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE',
        escopoCompartilhamento: null,
      });
      const compartilhamentoCreate = jest.fn().mockResolvedValue({});
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({
        imovelFindFirst,
        imovelUpdate,
        compartilhamentoCreate,
        registroDeAuditoriaCreate,
      });

      const imovel = await service.revogarCompartilhamento(tenantId, 'i1', atorUsuarioId);

      expect(imovel.estadoCompartilhamento).toBe('EXCLUSIVO_DA_UNIDADE');
      expect(imovel.escopoCompartilhamento).toBeNull();
      expect(compartilhamentoCreate).toHaveBeenCalledWith({
        data: { tenantId, imovelId: 'i1', evento: 'REVOGADO' },
      });
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId,
          acao: 'IMOVEL_COMPARTILHAMENTO_REVOGADO',
          entidadeTipo: 'Imovel',
          entidadeId: 'i1',
          motivo: undefined,
        },
      });
    });

    it('RN-006: rejeita revogar um imovel que nao esta compartilhado', async () => {
      const imovelFindFirst = jest
        .fn()
        .mockResolvedValue({ ...imovelBase, estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE' });
      const imovelUpdate = jest.fn();
      const { service } = criarServicoComTx({ imovelFindFirst, imovelUpdate });

      await expect(service.revogarCompartilhamento(tenantId, 'i1', atorUsuarioId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(imovelUpdate).not.toHaveBeenCalled();
    });
  });
});
