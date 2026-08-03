import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PropostasService } from './propostas.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

// Cobre US-016 e US-017 (ART-014) / RN-305, RN-306 (ART-009).
describe('PropostasService', () => {
  const tenantId = 'tenant-1';

  function criarServicoComTx(tx: {
    oportunidadeFindFirst?: jest.Mock;
    leadFindFirst?: jest.Mock;
    imovelFindFirst?: jest.Mock;
    usuarioFindFirst?: jest.Mock;
    propostaCreate?: jest.Mock;
    propostaFindFirst?: jest.Mock;
    propostaFindMany?: jest.Mock;
    propostaUpdate?: jest.Mock;
    validarResponsavelDaOportunidade?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          oportunidade: { findFirst: tx.oportunidadeFindFirst },
          lead: { findFirst: tx.leadFindFirst },
          imovel: { findFirst: tx.imovelFindFirst },
          usuario: { findFirst: tx.usuarioFindFirst },
          proposta: {
            create: tx.propostaCreate,
            findFirst: tx.propostaFindFirst,
            findMany: tx.propostaFindMany,
            update: tx.propostaUpdate,
          },
        }),
      ),
    } as unknown as TenantPrismaService;

    const oportunidadesService = {
      moverEstagioTx: jest.fn().mockResolvedValue({}),
      validarResponsavelDaOportunidade:
        tx.validarResponsavelDaOportunidade ?? jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1' }),
    } as unknown as OportunidadesService;

    return { service: new PropostasService(tenantPrisma, oportunidadesService), oportunidadesService };
  }

  const propostaBase = {
    id: 'prop1',
    tenantId,
    oportunidadeId: 'op1',
    tipo: 'INICIAL',
    valor: { toNumber: () => 500000 },
    condicoes: 'a vista',
    status: 'ENVIADA',
    aprovadorUsuarioId: null,
    criadoEm: new Date('2026-08-01T00:00:00.000Z'),
  };

  describe('registrar (US-016)', () => {
    it('cria a proposta e sincroniza a oportunidade para PROPOSTA_ENVIADA', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1' });
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const propostaCreate = jest.fn().mockResolvedValue(propostaBase);
      const { service, oportunidadesService } = criarServicoComTx({
        oportunidadeFindFirst,
        leadFindFirst,
        propostaCreate,
      });

      const resultado = await service.registrar(tenantId, 'op1', { valor: 500000, condicoes: 'a vista' }, 'usr1');

      expect(resultado.valor).toBe(500000);
      expect(oportunidadesService.moverEstagioTx).toHaveBeenCalledWith(expect.anything(), tenantId, 'op1', 'PROPOSTA_ENVIADA', 'usr1');
    });

    it('rejeita quando quem registra nao e o responsavel pelo lead', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1' });
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const propostaCreate = jest.fn();
      const { service } = criarServicoComTx({ oportunidadeFindFirst, leadFindFirst, propostaCreate });

      await expect(
        service.registrar(tenantId, 'op1', { valor: 500000, condicoes: 'a vista' }, 'outro'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(propostaCreate).not.toHaveBeenCalled();
    });

    it('oportunidade de outro tenant nao e encontrada (404)', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ oportunidadeFindFirst });

      await expect(
        service.registrar(tenantId, 'op-de-outro-tenant', { valor: 1, condicoes: 'x' }, 'usr1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('contrapropor (US-017)', () => {
    it('CA-001: desconto dentro da faixa pre-autorizada nao exige aprovador', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1', imovelId: 'imv1' });
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({
        valorAnunciado: { toNumber: () => 500000 },
        percentualDescontoPreAutorizado: { toNumber: () => 10 },
      });
      const propostaCreate = jest.fn().mockResolvedValue(propostaBase);
      const { service, oportunidadesService } = criarServicoComTx({
        oportunidadeFindFirst,
        leadFindFirst,
        imovelFindFirst,
        propostaCreate,
      });

      // desconto de 5% (475000 de 500000) - dentro da faixa de 10%
      await service.contrapropor(tenantId, 'op1', { valor: 475000, condicoes: 'a vista' }, 'usr1');

      expect(propostaCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aprovadorUsuarioId: null }) }),
      );
      expect(oportunidadesService.moverEstagioTx).toHaveBeenCalledWith(expect.anything(), tenantId, 'op1', 'EM_CONTRAPROPOSTA', 'usr1');
    });

    it('CA-002: desconto fora da faixa sem aprovador e bloqueado', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1', imovelId: 'imv1' });
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({
        valorAnunciado: { toNumber: () => 500000 },
        percentualDescontoPreAutorizado: { toNumber: () => 10 },
      });
      const propostaCreate = jest.fn();
      const { service } = criarServicoComTx({ oportunidadeFindFirst, leadFindFirst, imovelFindFirst, propostaCreate });

      // desconto de 20% - fora da faixa de 10%, sem aprovador
      await expect(
        service.contrapropor(tenantId, 'op1', { valor: 400000, condicoes: 'a vista' }, 'usr1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(propostaCreate).not.toHaveBeenCalled();
    });

    it('aceita desconto fora da faixa quando ha aprovador valido', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1', imovelId: 'imv1' });
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({
        valorAnunciado: { toNumber: () => 500000 },
        percentualDescontoPreAutorizado: { toNumber: () => 10 },
      });
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'gestor1', tenantId });
      const propostaCreate = jest.fn().mockResolvedValue(propostaBase);
      const { service } = criarServicoComTx({
        oportunidadeFindFirst,
        leadFindFirst,
        imovelFindFirst,
        usuarioFindFirst,
        propostaCreate,
      });

      await service.contrapropor(
        tenantId,
        'op1',
        { valor: 400000, condicoes: 'a vista', aprovadorUsuarioId: 'gestor1' },
        'usr1',
      );

      expect(propostaCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aprovadorUsuarioId: 'gestor1' }) }),
      );
    });

    it('cenario de excecao (DEC-NEG-013): imovel sem faixa cadastrada exige aprovador para qualquer desconto', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1', imovelId: 'imv1' });
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({
        valorAnunciado: { toNumber: () => 500000 },
        percentualDescontoPreAutorizado: null,
      });
      const propostaCreate = jest.fn();
      const { service } = criarServicoComTx({ oportunidadeFindFirst, leadFindFirst, imovelFindFirst, propostaCreate });

      await expect(
        service.contrapropor(tenantId, 'op1', { valor: 499000, condicoes: 'a vista' }, 'usr1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // PENDENCIA FECHADA (Permissões, US-017): "aceitar" nao verificava responsavel.
  describe('aceitar', () => {
    it('aceita a proposta quando o chamador e o responsavel pela oportunidade', async () => {
      const propostaFindFirst = jest.fn().mockResolvedValue({ ...propostaBase, oportunidadeId: 'op1' });
      const propostaUpdate = jest.fn().mockResolvedValue({ ...propostaBase, status: 'ACEITA' });
      const { service, oportunidadesService } = criarServicoComTx({ propostaFindFirst, propostaUpdate });

      const resultado = await service.aceitar(tenantId, 'prop1', 'usr1');

      expect(oportunidadesService.validarResponsavelDaOportunidade).toHaveBeenCalledWith(
        expect.anything(),
        tenantId,
        'op1',
        'usr1',
      );
      expect(resultado.status).toBe('ACEITA');
    });

    it('rejeita quem nao e o responsavel pela oportunidade', async () => {
      const propostaFindFirst = jest.fn().mockResolvedValue({ ...propostaBase, oportunidadeId: 'op1' });
      const propostaUpdate = jest.fn();
      const validarResponsavelDaOportunidade = jest.fn().mockRejectedValue(new BadRequestException('sem permissao'));
      const { service } = criarServicoComTx({ propostaFindFirst, propostaUpdate, validarResponsavelDaOportunidade });

      await expect(service.aceitar(tenantId, 'prop1', 'outro')).rejects.toBeInstanceOf(BadRequestException);
      expect(propostaUpdate).not.toHaveBeenCalled();
    });

    it('proposta de outro tenant nao e encontrada (404)', async () => {
      const propostaFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ propostaFindFirst });

      await expect(service.aceitar(tenantId, 'prop-de-outro-tenant', 'usr1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // PENDENCIA FECHADA: leitura nao verificava unidade.
  describe('listarPorOportunidade (escopo por unidade)', () => {
    it('rejeita quando a oportunidade nao pertence a unidade do chamador', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ oportunidadeFindFirst });

      await expect(service.listarPorOportunidade(tenantId, 'op1', 'outra-unidade')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // Base da tela "Propostas" (visao cruzada, fora do escopo de uma oportunidade).
  describe('listarTodas (visao cruzada por unidade)', () => {
    it('escopa por unidade via oportunidade.lead.unidadeId', async () => {
      const propostaFindMany = jest.fn().mockResolvedValue([]);
      const { service } = criarServicoComTx({ propostaFindMany });

      await service.listarTodas(tenantId, 'un-A');

      expect(propostaFindMany).toHaveBeenCalledWith({
        where: { tenantId, oportunidade: { lead: { unidadeId: 'un-A' } } },
        orderBy: { criadoEm: 'desc' },
      });
    });
  });
});
