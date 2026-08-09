import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GarantiasService } from './garantias.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-104/US-105 (ART-015-backlog-fase-2.md) / RN-402, RN-403 (ART-010).
describe('GarantiasService', () => {
  const tenantId = 'tenant-1';
  const unidadeId = 'un-A';

  function criarServicoComTx(tx: {
    contratoDeLocacaoFindFirst?: jest.Mock;
    pessoaFindFirst?: jest.Mock;
    garantiaCreate?: jest.Mock;
    garantiaFindFirst?: jest.Mock;
    garantiaUpdate?: jest.Mock;
    garantiaFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          contratoDeLocacao: { findFirst: tx.contratoDeLocacaoFindFirst },
          pessoa: { findFirst: tx.pessoaFindFirst },
          garantia: {
            create: tx.garantiaCreate,
            findFirst: tx.garantiaFindFirst,
            update: tx.garantiaUpdate,
            findMany: tx.garantiaFindMany,
          },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);

    return { service: new GarantiasService(tenantPrisma, auditoriaService) };
  }

  const contratoBase = { id: 'cl1', tenantId };

  const garantiaCaucaoRecord = {
    id: 'g1',
    tenantId,
    contratoDeLocacaoId: 'cl1',
    tipo: 'CAUCAO',
    estado: 'EM_ANALISE',
    fiadorPessoaId: null,
    substituiGarantiaId: null,
    criadoEm: new Date('2026-08-02T00:00:00.000Z'),
  };

  describe('registrar', () => {
    it('cria a garantia EM_ANALISE para um tipo sem fiador (CAUCAO)', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoBase);
      const garantiaCreate = jest.fn().mockResolvedValue(garantiaCaucaoRecord);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, garantiaCreate });

      const resultado = await service.registrar(tenantId, 'usr1', unidadeId, 'cl1', { tipo: 'CAUCAO' });

      expect(garantiaCreate).toHaveBeenCalledWith({
        data: { tenantId, contratoDeLocacaoId: 'cl1', tipo: 'CAUCAO', fiadorPessoaId: null },
      });
      expect(resultado.estado).toBe('EM_ANALISE');
    });

    it('cria a garantia do tipo FIADOR quando o fiador existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoBase);
      const pessoaFindFirst = jest.fn().mockResolvedValue({ id: 'pe-fiador', tenantId });
      const garantiaCreate = jest.fn().mockResolvedValue({ ...garantiaCaucaoRecord, tipo: 'FIADOR', fiadorPessoaId: 'pe-fiador' });
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, pessoaFindFirst, garantiaCreate });

      await service.registrar(tenantId, 'usr1', unidadeId, 'cl1', { tipo: 'FIADOR', fiadorPessoaId: 'pe-fiador' });

      expect(garantiaCreate).toHaveBeenCalledWith({
        data: { tenantId, contratoDeLocacaoId: 'cl1', tipo: 'FIADOR', fiadorPessoaId: 'pe-fiador' },
      });
    });

    it('rejeita FIADOR sem fiadorPessoaId', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoBase);
      const garantiaCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, garantiaCreate });

      await expect(service.registrar(tenantId, 'usr1', unidadeId, 'cl1', { tipo: 'FIADOR' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(garantiaCreate).not.toHaveBeenCalled();
    });

    it('rejeita fiadorPessoaId informado para tipo que nao e FIADOR', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoBase);
      const garantiaCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, garantiaCreate });

      await expect(
        service.registrar(tenantId, 'usr1', unidadeId, 'cl1', { tipo: 'CAUCAO', fiadorPessoaId: 'pe1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(garantiaCreate).not.toHaveBeenCalled();
    });

    it('rejeita quando o contrato de locacao nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(service.registrar(tenantId, 'usr1', unidadeId, 'cl-outro-tenant', { tipo: 'CAUCAO' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('CORREÇÃO DE SEGURANÇA: escopa a busca do contrato pela unidade do chamador (nunca só tenantId)', async () => {
      // Simula o comportamento real do Prisma/RLS: um contrato de OUTRA
      // unidade não deveria "aparecer" para este chamador - o mock só
      // resolve quando o where clause bate exatamente com a unidade certa.
      const contratoDeLocacaoFindFirst = jest.fn((args) =>
        args.where.contratoDeAdministracao?.unidadeId === unidadeId ? Promise.resolve(contratoBase) : Promise.resolve(null),
      );
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(
        service.registrar(tenantId, 'usr1', 'un-DE-OUTRA-UNIDADE', 'cl1', { tipo: 'CAUCAO' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(contratoDeLocacaoFindFirst).toHaveBeenCalledWith({
        where: { id: 'cl1', tenantId, contratoDeAdministracao: { unidadeId: 'un-DE-OUTRA-UNIDADE' } },
      });
    });
  });

  describe('trocar (RN-403)', () => {
    it('cria a nova garantia EM_ANALISE apontando para a atual, e marca a atual como EM_SUBSTITUICAO (nunca encerra direto)', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoBase);
      const garantiaAtiva = { id: 'g-antiga', tenantId, contratoDeLocacaoId: 'cl1', estado: 'ATIVA' };
      const garantiaFindFirst = jest.fn().mockResolvedValue(garantiaAtiva);
      const novaGarantia = { ...garantiaCaucaoRecord, id: 'g-nova', substituiGarantiaId: 'g-antiga' };
      const garantiaCreate = jest.fn().mockResolvedValue(novaGarantia);
      const garantiaUpdate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({
        contratoDeLocacaoFindFirst,
        garantiaFindFirst,
        garantiaCreate,
        garantiaUpdate,
      });

      const resultado = await service.trocar(tenantId, 'usr1', unidadeId, 'cl1', { tipo: 'CAUCAO' });

      expect(garantiaCreate).toHaveBeenCalledWith({
        data: { tenantId, contratoDeLocacaoId: 'cl1', tipo: 'CAUCAO', fiadorPessoaId: null, substituiGarantiaId: 'g-antiga' },
      });
      // a antiga NUNCA e encerrada aqui - so entra em substituicao (sem janela sem cobertura):
      expect(garantiaUpdate).toHaveBeenCalledWith({ where: { id: 'g-antiga' }, data: { estado: 'EM_SUBSTITUICAO' } });
      expect(garantiaUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ data: { estado: 'ENCERRADA' } }));
      expect(resultado.substituiGarantiaId).toBe('g-antiga');
    });

    it('rejeita quando nao ha garantia ATIVA para trocar', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoBase);
      const garantiaFindFirst = jest.fn().mockResolvedValue(null);
      const garantiaCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, garantiaFindFirst, garantiaCreate });

      await expect(service.trocar(tenantId, 'usr1', unidadeId, 'cl1', { tipo: 'CAUCAO' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(garantiaCreate).not.toHaveBeenCalled();
    });
  });

  describe('ativar', () => {
    it('ativa uma garantia EM_ANALISE simples (sem substituicao)', async () => {
      const garantiaFindFirst = jest.fn().mockResolvedValue({ ...garantiaCaucaoRecord, substituiGarantiaId: null });
      const garantiaUpdate = jest.fn().mockResolvedValue({ ...garantiaCaucaoRecord, estado: 'ATIVA' });
      const { service } = criarServicoComTx({ garantiaFindFirst, garantiaUpdate });

      const resultado = await service.ativar(tenantId, 'usr1', unidadeId, 'g1');

      expect(garantiaUpdate).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { estado: 'ATIVA' } });
      expect(garantiaUpdate).toHaveBeenCalledTimes(1);
      expect(resultado.estado).toBe('ATIVA');
    });

    it('RN-403/CA-402: ao ativar uma substituta, encerra a antiga NA MESMA transacao - nunca as duas ativas nem janela sem garantia', async () => {
      const garantiaFindFirst = jest.fn().mockResolvedValue({ ...garantiaCaucaoRecord, id: 'g-nova', substituiGarantiaId: 'g-antiga' });
      const garantiaUpdate = jest.fn().mockResolvedValue({ ...garantiaCaucaoRecord, id: 'g-nova', estado: 'ATIVA' });
      const { service } = criarServicoComTx({ garantiaFindFirst, garantiaUpdate });

      await service.ativar(tenantId, 'usr1', unidadeId, 'g-nova');

      expect(garantiaUpdate).toHaveBeenCalledWith({ where: { id: 'g-nova' }, data: { estado: 'ATIVA' } });
      expect(garantiaUpdate).toHaveBeenCalledWith({ where: { id: 'g-antiga' }, data: { estado: 'ENCERRADA' } });
      expect(garantiaUpdate).toHaveBeenCalledTimes(2);
    });

    it('rejeita ativar uma garantia que nao esta EM_ANALISE', async () => {
      const garantiaFindFirst = jest.fn().mockResolvedValue({ ...garantiaCaucaoRecord, estado: 'ATIVA' });
      const garantiaUpdate = jest.fn();
      const { service } = criarServicoComTx({ garantiaFindFirst, garantiaUpdate });

      await expect(service.ativar(tenantId, 'usr1', unidadeId, 'g1')).rejects.toBeInstanceOf(BadRequestException);
      expect(garantiaUpdate).not.toHaveBeenCalled();
    });

    it('rejeita quando a garantia nao existe no tenant', async () => {
      const garantiaFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ garantiaFindFirst });

      await expect(service.ativar(tenantId, 'usr1', unidadeId, 'g-de-outro-tenant')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar', () => {
    it('lista as garantias do contrato quando ele pertence ao tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoBase);
      const garantiaFindMany = jest.fn().mockResolvedValue([garantiaCaucaoRecord]);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, garantiaFindMany });

      const resultado = await service.listar(tenantId, unidadeId, 'cl1');

      expect(garantiaFindMany).toHaveBeenCalledWith({
        where: { tenantId, contratoDeLocacaoId: 'cl1' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(resultado).toHaveLength(1);
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(service.listar(tenantId, unidadeId, 'cl-de-outro-tenant')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
