import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VistoriasService } from './vistorias.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContratosLocacaoService } from './contratos-locacao.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

// Cobre US-106/US-107 (ART-015-backlog-fase-2.md) / RN-404, RN-405 (ART-010).
describe('VistoriasService', () => {
  const tenantId = 'tenant-1';
  const unidadeId = 'un-A';
  const gestor: UsuarioAutenticado = { id: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const outroGestor: UsuarioAutenticado = { id: 'usr3', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'usr2', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR' };

  function criarServicoComTx(tx: {
    contratoDeLocacaoFindFirst?: jest.Mock;
    vistoriaCreate?: jest.Mock;
    vistoriaFindFirst?: jest.Mock;
    vistoriaUpdate?: jest.Mock;
    vistoriaFindMany?: jest.Mock;
    contestacaoDeVistoriaCreate?: jest.Mock;
    contestacaoDeVistoriaFindFirst?: jest.Mock;
    contestacaoDeVistoriaUpdate?: jest.Mock;
    contestacaoDeVistoriaFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          contratoDeLocacao: { findFirst: tx.contratoDeLocacaoFindFirst },
          vistoria: {
            create: tx.vistoriaCreate,
            findFirst: tx.vistoriaFindFirst,
            update: tx.vistoriaUpdate,
            findMany: tx.vistoriaFindMany,
          },
          contestacaoDeVistoria: {
            create: tx.contestacaoDeVistoriaCreate,
            findFirst: tx.contestacaoDeVistoriaFindFirst,
            update: tx.contestacaoDeVistoriaUpdate,
            findMany: tx.contestacaoDeVistoriaFindMany,
          },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);
    const contratosLocacaoService = { moverEstagioTx: jest.fn().mockResolvedValue({}) } as unknown as ContratosLocacaoService;

    return {
      service: new VistoriasService(tenantPrisma, auditoriaService, contratosLocacaoService),
      contratosLocacaoService,
    };
  }

  const contratoAguardandoVistoria = { id: 'cl1', tenantId, estado: 'AGUARDANDO_VISTORIA_ENTRADA' };

  const vistoriaAgendadaEntrada = {
    id: 'v1',
    tenantId,
    contratoDeLocacaoId: 'cl1',
    tipo: 'ENTRADA',
    estado: 'AGENDADA',
    dataHora: new Date('2026-09-05T10:00:00.000Z'),
    laudo: null,
    evidencias: null,
    realizadaEm: null,
    realizadoPorUsuarioId: null,
    prazoContestacaoAte: null,
    criadoEm: new Date('2026-08-03T00:00:00.000Z'),
  };

  describe('agendar', () => {
    it('agenda vistoria de ENTRADA quando o contrato esta AGUARDANDO_VISTORIA_ENTRADA', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoAguardandoVistoria);
      const vistoriaCreate = jest.fn().mockResolvedValue(vistoriaAgendadaEntrada);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, vistoriaCreate });

      const resultado = await service.agendar(tenantId, 'usr1', unidadeId, {
        contratoDeLocacaoId: 'cl1',
        tipo: 'ENTRADA',
        dataHora: '2026-09-05T10:00:00.000Z',
      });

      expect(vistoriaCreate).toHaveBeenCalledWith({
        data: { tenantId, contratoDeLocacaoId: 'cl1', tipo: 'ENTRADA', dataHora: new Date('2026-09-05T10:00:00.000Z') },
      });
      expect(resultado.estado).toBe('AGENDADA');
    });

    it('rejeita agendar ENTRADA quando o contrato nao esta AGUARDANDO_VISTORIA_ENTRADA', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ ...contratoAguardandoVistoria, estado: 'RASCUNHO' });
      const vistoriaCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, vistoriaCreate });

      await expect(
        service.agendar(tenantId, 'usr1', unidadeId, { contratoDeLocacaoId: 'cl1', tipo: 'ENTRADA', dataHora: '2026-09-05T10:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(vistoriaCreate).not.toHaveBeenCalled();
    });

    it('agenda vistoria de SAIDA quando o contrato esta VIGENTE', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ ...contratoAguardandoVistoria, estado: 'VIGENTE' });
      const vistoriaCreate = jest.fn().mockResolvedValue({ ...vistoriaAgendadaEntrada, tipo: 'SAIDA' });
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, vistoriaCreate });

      await expect(
        service.agendar(tenantId, 'usr1', unidadeId, { contratoDeLocacaoId: 'cl1', tipo: 'SAIDA', dataHora: '2026-09-05T10:00:00.000Z' }),
      ).resolves.toBeDefined();
    });

    it('rejeita agendar SAIDA quando o contrato ainda esta em RASCUNHO (EXTENSAO REGISTRADA)', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ ...contratoAguardandoVistoria, estado: 'RASCUNHO' });
      const vistoriaCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, vistoriaCreate });

      await expect(
        service.agendar(tenantId, 'usr1', unidadeId, { contratoDeLocacaoId: 'cl1', tipo: 'SAIDA', dataHora: '2026-09-05T10:00:00.000Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(vistoriaCreate).not.toHaveBeenCalled();
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(
        service.agendar(tenantId, 'usr1', unidadeId, { contratoDeLocacaoId: 'cl-outro-tenant', tipo: 'ENTRADA', dataHora: '2026-09-05T10:00:00.000Z' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('CORREÇÃO DE SEGURANÇA: rejeita agendar vistoria de um contrato de OUTRA unidade, mesmo do mesmo tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn((args) =>
        args.where.contratoDeAdministracao?.unidadeId === unidadeId ? Promise.resolve(contratoAguardandoVistoria) : Promise.resolve(null),
      );
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(
        service.agendar(tenantId, 'usr1', 'un-DE-OUTRA-UNIDADE', {
          contratoDeLocacaoId: 'cl1',
          tipo: 'ENTRADA',
          dataHora: '2026-09-05T10:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('realizarLaudo (RN-404/US-107)', () => {
    it('CORRETOR nao pode registrar laudo (so GESTOR_UNIDADE, ART-010 §13)', async () => {
      const { service } = criarServicoComTx({});

      await expect(service.realizarLaudo(tenantId, corretor, 'v1', { laudo: 'ok' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('registra o laudo (com autor) e, para ENTRADA, aciona ContratoDeLocacao.moverEstagioTx para VIGENTE, sem prazo de contestacao', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue(vistoriaAgendadaEntrada);
      const vistoriaUpdate = jest.fn().mockResolvedValue({ ...vistoriaAgendadaEntrada, estado: 'REALIZADA', laudo: 'Tudo ok' });
      const { service, contratosLocacaoService } = criarServicoComTx({ vistoriaFindFirst, vistoriaUpdate });

      const resultado = await service.realizarLaudo(tenantId, gestor, 'v1', { laudo: 'Tudo ok' });

      expect(vistoriaUpdate).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: {
          estado: 'REALIZADA',
          laudo: 'Tudo ok',
          evidencias: undefined,
          realizadaEm: expect.any(Date),
          realizadoPorUsuarioId: gestor.id,
          prazoContestacaoAte: null,
        },
      });
      expect(contratosLocacaoService.moverEstagioTx).toHaveBeenCalledWith(
        expect.anything(),
        tenantId,
        'cl1',
        'VIGENTE',
        gestor.id,
      );
      expect(resultado.estado).toBe('REALIZADA');
    });

    it('para SAIDA, registra o laudo com prazo de contestacao (5 dias uteis) e NAO aciona moverEstagioTx', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue({ ...vistoriaAgendadaEntrada, tipo: 'SAIDA' });
      const vistoriaUpdate = jest.fn().mockResolvedValue({ ...vistoriaAgendadaEntrada, tipo: 'SAIDA', estado: 'REALIZADA' });
      const { service, contratosLocacaoService } = criarServicoComTx({ vistoriaFindFirst, vistoriaUpdate });

      await service.realizarLaudo(tenantId, gestor, 'v1', { laudo: 'Saida ok' });

      expect(contratosLocacaoService.moverEstagioTx).not.toHaveBeenCalled();
      const dadosGravados = vistoriaUpdate.mock.calls[0][0].data;
      expect(dadosGravados.realizadoPorUsuarioId).toBe(gestor.id);
      expect(dadosGravados.prazoContestacaoAte).toBeInstanceOf(Date);
      expect(dadosGravados.prazoContestacaoAte.getTime()).toBeGreaterThan(dadosGravados.realizadaEm.getTime());
    });

    it('rejeita registrar laudo de vistoria que nao esta AGENDADA', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue({ ...vistoriaAgendadaEntrada, estado: 'REALIZADA' });
      const { service } = criarServicoComTx({ vistoriaFindFirst });

      await expect(service.realizarLaudo(tenantId, gestor, 'v1', { laudo: 'ok' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejeita quando a vistoria nao existe no tenant', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ vistoriaFindFirst });

      await expect(service.realizarLaudo(tenantId, gestor, 'v-outro-tenant', { laudo: 'ok' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('registrarContestacao (RN-405/DEC-NEG-016)', () => {
    const vistoriaSaidaRealizada = {
      id: 'v2',
      tenantId,
      contratoDeLocacaoId: 'cl1',
      tipo: 'SAIDA',
      estado: 'REALIZADA',
      dataHora: new Date('2026-09-05T10:00:00.000Z'),
      laudo: 'Laudo de saida',
      evidencias: null,
      realizadaEm: new Date('2026-08-06T10:00:00.000Z'),
      realizadoPorUsuarioId: gestor.id,
      prazoContestacaoAte: new Date('2026-08-13T10:00:00.000Z'),
      criadoEm: new Date('2026-08-06T10:00:00.000Z'),
    };

    it('registra a contestacao dentro do prazo e move a vistoria para EM_CONTESTACAO', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue(vistoriaSaidaRealizada);
      const vistoriaUpdate = jest.fn().mockResolvedValue({});
      const contestacaoDeVistoriaCreate = jest.fn().mockResolvedValue({
        id: 'ct1',
        tenantId,
        vistoriaId: 'v2',
        motivo: 'Dano preexistente',
        evidencia: 'foto.jpg',
        contestadoPorUsuarioId: corretor.id,
        analistaUsuarioId: null,
        decisao: null,
        justificativaDecisao: null,
        criadoEm: new Date('2026-08-07T00:00:00.000Z'),
        decididoEm: null,
      });
      const { service } = criarServicoComTx({ vistoriaFindFirst, vistoriaUpdate, contestacaoDeVistoriaCreate });

      const resultado = await service.registrarContestacao(tenantId, corretor.id, unidadeId, 'v2', {
        motivo: 'Dano preexistente',
        evidencia: 'foto.jpg',
      });

      expect(contestacaoDeVistoriaCreate).toHaveBeenCalledWith({
        data: { tenantId, vistoriaId: 'v2', motivo: 'Dano preexistente', evidencia: 'foto.jpg', contestadoPorUsuarioId: corretor.id },
      });
      expect(vistoriaUpdate).toHaveBeenCalledWith({ where: { id: 'v2' }, data: { estado: 'EM_CONTESTACAO' } });
      expect(resultado.decisao).toBeNull();
    });

    it('rejeita contestar vistoria de ENTRADA', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue({ ...vistoriaSaidaRealizada, tipo: 'ENTRADA' });
      const { service } = criarServicoComTx({ vistoriaFindFirst });

      await expect(
        service.registrarContestacao(tenantId, corretor.id, unidadeId, 'v2', { motivo: 'x', evidencia: 'y' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita contestar fora do prazo formal (DEC-NEG-016)', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue({
        ...vistoriaSaidaRealizada,
        prazoContestacaoAte: new Date('2020-01-01T00:00:00.000Z'),
      });
      const { service } = criarServicoComTx({ vistoriaFindFirst });

      await expect(
        service.registrarContestacao(tenantId, corretor.id, unidadeId, 'v2', { motivo: 'x', evidencia: 'y' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita contestar vistoria que nao esta REALIZADA', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue({ ...vistoriaSaidaRealizada, estado: 'CONFIRMADA' });
      const { service } = criarServicoComTx({ vistoriaFindFirst });

      await expect(
        service.registrarContestacao(tenantId, corretor.id, unidadeId, 'v2', { motivo: 'x', evidencia: 'y' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita quando a vistoria nao existe no tenant', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ vistoriaFindFirst });

      await expect(
        service.registrarContestacao(tenantId, corretor.id, unidadeId, 'v-outro-tenant', { motivo: 'x', evidencia: 'y' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('decidirContestacao (RN-405/CA-403/TEST-403)', () => {
    const vistoriaEmContestacao = {
      id: 'v2',
      tenantId,
      contratoDeLocacaoId: 'cl1',
      tipo: 'SAIDA',
      estado: 'EM_CONTESTACAO',
      dataHora: new Date('2026-09-05T10:00:00.000Z'),
      laudo: 'Laudo de saida',
      evidencias: null,
      realizadaEm: new Date('2026-08-06T10:00:00.000Z'),
      realizadoPorUsuarioId: gestor.id,
      prazoContestacaoAte: new Date('2026-08-13T10:00:00.000Z'),
      criadoEm: new Date('2026-08-06T10:00:00.000Z'),
    };

    const contestacaoPendente = {
      id: 'ct1',
      tenantId,
      vistoriaId: 'v2',
      motivo: 'Dano preexistente',
      evidencia: 'foto.jpg',
      contestadoPorUsuarioId: corretor.id,
      analistaUsuarioId: null,
      decisao: null,
      justificativaDecisao: null,
      criadoEm: new Date('2026-08-07T00:00:00.000Z'),
      decididoEm: null,
    };

    it('CORRETOR nao pode decidir contestacao (so GESTOR_UNIDADE, ART-010 §13)', async () => {
      const { service } = criarServicoComTx({});

      await expect(
        service.decidirContestacao(tenantId, corretor, 'v2', { decisao: 'CONFIRMADA', justificativaDecisao: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('TEST-403: quem registrou o laudo original nao pode decidir a propria contestacao', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue(vistoriaEmContestacao);
      const { service } = criarServicoComTx({ vistoriaFindFirst });

      await expect(
        service.decidirContestacao(tenantId, gestor, 'v2', { decisao: 'CONFIRMADA', justificativaDecisao: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('um analista distinto decide e a vistoria assume o estado da decisao', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue(vistoriaEmContestacao);
      const vistoriaUpdate = jest.fn().mockResolvedValue({});
      const contestacaoDeVistoriaFindFirst = jest.fn().mockResolvedValue(contestacaoPendente);
      const contestacaoDeVistoriaUpdate = jest.fn().mockResolvedValue({
        ...contestacaoPendente,
        analistaUsuarioId: outroGestor.id,
        decisao: 'RETIFICADA',
        justificativaDecisao: 'Dano confirmado na evidencia',
        decididoEm: new Date('2026-08-08T00:00:00.000Z'),
      });
      const { service } = criarServicoComTx({
        vistoriaFindFirst,
        vistoriaUpdate,
        contestacaoDeVistoriaFindFirst,
        contestacaoDeVistoriaUpdate,
      });

      const resultado = await service.decidirContestacao(tenantId, outroGestor, 'v2', {
        decisao: 'RETIFICADA',
        justificativaDecisao: 'Dano confirmado na evidencia',
      });

      expect(contestacaoDeVistoriaUpdate).toHaveBeenCalledWith({
        where: { id: 'ct1' },
        data: {
          analistaUsuarioId: outroGestor.id,
          decisao: 'RETIFICADA',
          justificativaDecisao: 'Dano confirmado na evidencia',
          decididoEm: expect.any(Date),
        },
      });
      expect(vistoriaUpdate).toHaveBeenCalledWith({ where: { id: 'v2' }, data: { estado: 'RETIFICADA' } });
      expect(resultado.decisao).toBe('RETIFICADA');
    });

    it('rejeita decidir vistoria que nao esta EM_CONTESTACAO', async () => {
      const vistoriaFindFirst = jest.fn().mockResolvedValue({ ...vistoriaEmContestacao, estado: 'REALIZADA' });
      const { service } = criarServicoComTx({ vistoriaFindFirst });

      await expect(
        service.decidirContestacao(tenantId, outroGestor, 'v2', { decisao: 'CONFIRMADA', justificativaDecisao: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('executarVarreduraAutomaticaTx (ART-010 §8.3 - prazo decorrido sem contestacao)', () => {
    it('confirma automaticamente vistorias de SAIDA REALIZADA com prazo vencido', async () => {
      const vencida = {
        id: 'v3',
        tenantId,
        estado: 'REALIZADA',
        tipo: 'SAIDA',
        prazoContestacaoAte: new Date('2020-01-01T00:00:00.000Z'),
      };
      const vistoriaFindMany = jest.fn().mockResolvedValue([vencida]);
      const vistoriaUpdate = jest.fn().mockResolvedValue({});
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const { service } = criarServicoComTx({ vistoriaFindMany, vistoriaUpdate, registroDeAuditoriaCreate });

      const tx = {
        vistoria: { findMany: vistoriaFindMany, update: vistoriaUpdate },
        registroDeAuditoria: { create: registroDeAuditoriaCreate },
      } as unknown as Parameters<VistoriasService['executarVarreduraAutomaticaTx']>[0];

      await service.executarVarreduraAutomaticaTx(tx, tenantId);

      expect(vistoriaUpdate).toHaveBeenCalledWith({ where: { id: 'v3' }, data: { estado: 'CONFIRMADA' } });
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ atorUsuarioId: null, acao: 'VISTORIA_ESTADO_ALTERADO' }) }),
      );
    });
  });

  describe('listar', () => {
    it('lista as vistorias do contrato ordenadas por dataHora', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoAguardandoVistoria);
      const vistoriaFindMany = jest.fn().mockResolvedValue([vistoriaAgendadaEntrada]);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, vistoriaFindMany });

      const resultado = await service.listar(tenantId, unidadeId, 'cl1');

      expect(vistoriaFindMany).toHaveBeenCalledWith({
        where: { tenantId, contratoDeLocacaoId: 'cl1' },
        orderBy: { dataHora: 'asc' },
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
