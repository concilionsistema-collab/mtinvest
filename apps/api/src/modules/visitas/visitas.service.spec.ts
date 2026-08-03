import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VisitasService } from './visitas.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

// Cobre US-014 e US-015 (ART-014) / RN-303, RN-304 (ART-009).
describe('VisitasService', () => {
  const tenantId = 'tenant-1';

  function criarServicoComTx(tx: {
    oportunidadeFindFirst?: jest.Mock;
    usuarioFindFirst?: jest.Mock;
    visitaCreate?: jest.Mock;
    visitaFindFirst?: jest.Mock;
    visitaFindMany?: jest.Mock;
    visitaUpdate?: jest.Mock;
    validarResponsavelDaOportunidade?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          oportunidade: { findFirst: tx.oportunidadeFindFirst },
          usuario: { findFirst: tx.usuarioFindFirst },
          visita: {
            create: tx.visitaCreate,
            findFirst: tx.visitaFindFirst,
            findMany: tx.visitaFindMany,
            update: tx.visitaUpdate,
          },
        }),
      ),
    } as unknown as TenantPrismaService;

    const oportunidadesService = {
      moverEstagioTx: jest.fn().mockResolvedValue({}),
      // PENDENCIA FECHADA (Permissões, US-014/US-015): default permite o
      // chamador ('usr1' em todos os testes existentes) - agendar() usa o
      // retorno para checar oportunidade.estado, sobrescrito nos testes que
      // dependem de um estado especifico.
      validarResponsavelDaOportunidade:
        tx.validarResponsavelDaOportunidade ?? jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'QUALIFICACAO' }),
    } as unknown as OportunidadesService;

    return { service: new VisitasService(tenantPrisma, oportunidadesService), oportunidadesService };
  }

  const visitaBase = {
    id: 'v1',
    tenantId,
    oportunidadeId: 'op1',
    dataHora: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // daqui a 5 dias, sem alerta
    estado: 'AGENDADA',
    resultado: null,
    criadoEm: new Date('2026-08-01T00:00:00.000Z'),
  };

  describe('agendar (US-014)', () => {
    it('cria a visita e sincroniza a oportunidade para VISITA_AGENDADA quando ela esta em QUALIFICACAO', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId });
      const visitaCreate = jest.fn().mockResolvedValue(visitaBase);
      const validarResponsavelDaOportunidade = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'QUALIFICACAO' });
      const { service, oportunidadesService } = criarServicoComTx({
        usuarioFindFirst,
        visitaCreate,
        validarResponsavelDaOportunidade,
      });

      await service.agendar(tenantId, { oportunidadeId: 'op1', dataHora: visitaBase.dataHora.toISOString() }, 'usr1');

      // PENDENCIA FECHADA (Permissões, US-014): so o responsavel pela oportunidade agenda.
      expect(oportunidadesService.validarResponsavelDaOportunidade).toHaveBeenCalledWith(
        expect.anything(),
        tenantId,
        'op1',
        'usr1',
      );
      expect(oportunidadesService.moverEstagioTx).toHaveBeenCalledWith(expect.anything(), tenantId, 'op1', 'VISITA_AGENDADA', 'usr1');
    });

    it('nao tenta mover a oportunidade se ela ja passou de QUALIFICACAO (remarcacao)', async () => {
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId });
      const visitaCreate = jest.fn().mockResolvedValue(visitaBase);
      const validarResponsavelDaOportunidade = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'VISITA_CONFIRMADA' });
      const { service, oportunidadesService } = criarServicoComTx({
        usuarioFindFirst,
        visitaCreate,
        validarResponsavelDaOportunidade,
      });

      await service.agendar(tenantId, { oportunidadeId: 'op1', dataHora: visitaBase.dataHora.toISOString() }, 'usr1');

      expect(oportunidadesService.moverEstagioTx).not.toHaveBeenCalled();
    });

    it('PENDENCIA FECHADA (Permissões, US-014): rejeita quem nao e o responsavel pela oportunidade', async () => {
      const visitaCreate = jest.fn();
      const validarResponsavelDaOportunidade = jest.fn().mockRejectedValue(new BadRequestException('sem permissao'));
      const { service } = criarServicoComTx({ visitaCreate, validarResponsavelDaOportunidade });

      await expect(
        service.agendar(tenantId, { oportunidadeId: 'op1', dataHora: visitaBase.dataHora.toISOString() }, 'outro'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(visitaCreate).not.toHaveBeenCalled();
    });
  });

  describe('listarPorOportunidade (escopo por unidade)', () => {
    it('PENDENCIA FECHADA: rejeita quando a oportunidade nao pertence a unidade do chamador', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ oportunidadeFindFirst });

      await expect(service.listarPorOportunidade(tenantId, 'op1', 'outra-unidade')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lista as visitas quando a oportunidade pertence a unidade do chamador', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1' });
      const visitaFindMany = jest.fn().mockResolvedValue([visitaBase]);
      const tenantPrisma = {
        run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
          work({
            oportunidade: { findFirst: oportunidadeFindFirst },
            visita: { findMany: visitaFindMany },
          }),
        ),
      } as unknown as TenantPrismaService;
      const service = new VisitasService(tenantPrisma, { validarResponsavelDaOportunidade: jest.fn() } as unknown as OportunidadesService);

      const resultado = await service.listarPorOportunidade(tenantId, 'op1', 'u1');

      expect(oportunidadeFindFirst).toHaveBeenCalledWith({ where: { id: 'op1', tenantId, lead: { unidadeId: 'u1' } } });
      expect(resultado).toHaveLength(1);
    });
  });

  describe('confirmar (US-014 CA-001)', () => {
    it('confirma a visita e sincroniza a oportunidade para VISITA_CONFIRMADA', async () => {
      const visitaFindFirst = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'AGENDADA' });
      const visitaUpdate = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'CONFIRMADA' });
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'VISITA_AGENDADA' });
      const { service, oportunidadesService } = criarServicoComTx({
        visitaFindFirst,
        visitaUpdate,
        oportunidadeFindFirst,
      });

      const resultado = await service.confirmar(tenantId, 'v1', 'usr1');

      expect(resultado.estado).toBe('CONFIRMADA');
      expect(oportunidadesService.moverEstagioTx).toHaveBeenCalledWith(expect.anything(), tenantId, 'op1', 'VISITA_CONFIRMADA', 'usr1');
    });

    it('rejeita confirmar uma visita que nao esta agendada', async () => {
      const visitaFindFirst = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'CANCELADA' });
      const { service } = criarServicoComTx({ visitaFindFirst });

      await expect(service.confirmar(tenantId, 'v1', 'usr1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('visita de outro tenant nao e encontrada (404)', async () => {
      const visitaFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ visitaFindFirst });

      await expect(service.confirmar(tenantId, 'v-de-outro-tenant', 'usr1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('realizar (US-015)', () => {
    it('CA-001: exige resultado e avanca a oportunidade quando o resultado indica seguimento', async () => {
      const visitaFindFirst = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'CONFIRMADA' });
      const visitaUpdate = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'REALIZADA', resultado: 'INTERESSADO' });
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'VISITA_CONFIRMADA' });
      const { service, oportunidadesService } = criarServicoComTx({
        visitaFindFirst,
        visitaUpdate,
        oportunidadeFindFirst,
      });

      await service.realizar(tenantId, 'v1', { resultado: 'INTERESSADO' }, 'usr1');

      expect(oportunidadesService.moverEstagioTx).toHaveBeenCalledWith(expect.anything(), tenantId, 'op1', 'VISITA_REALIZADA', 'usr1');
    });

    it('cenario de excecao: "nao compareceu" nao avanca a oportunidade automaticamente', async () => {
      const visitaFindFirst = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'CONFIRMADA' });
      const visitaUpdate = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'REALIZADA', resultado: 'NAO_COMPARECEU' });
      const { service, oportunidadesService } = criarServicoComTx({ visitaFindFirst, visitaUpdate });

      await service.realizar(tenantId, 'v1', { resultado: 'NAO_COMPARECEU' }, 'usr1');

      expect(oportunidadesService.moverEstagioTx).not.toHaveBeenCalled();
    });

    it('rejeita concluir visita que nao esta confirmada', async () => {
      const visitaFindFirst = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'AGENDADA' });
      const { service } = criarServicoComTx({ visitaFindFirst });

      await expect(service.realizar(tenantId, 'v1', { resultado: 'INTERESSADO' }, 'usr1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // Base da tela "Visitas" (visao cruzada, fora do escopo de uma oportunidade).
  describe('listarTodas (visao cruzada por unidade)', () => {
    it('escopa por unidade via oportunidade.lead.unidadeId', async () => {
      const visitaFindMany = jest.fn().mockResolvedValue([]);
      const { service } = criarServicoComTx({ visitaFindMany });

      await service.listarTodas(tenantId, 'un-A');

      expect(visitaFindMany).toHaveBeenCalledWith({
        where: { tenantId, oportunidade: { lead: { unidadeId: 'un-A' } } },
        orderBy: { dataHora: 'asc' },
      });
    });
  });

  describe('cancelar', () => {
    it('cenario de excecao: cancelamento preserva o registro (nunca apaga), so muda o estado', async () => {
      const visitaFindFirst = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'AGENDADA' });
      const visitaUpdate = jest.fn().mockResolvedValue({ ...visitaBase, estado: 'CANCELADA' });
      const { service } = criarServicoComTx({ visitaFindFirst, visitaUpdate });

      const resultado = await service.cancelar(tenantId, 'v1', 'usr1');

      expect(visitaUpdate).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { estado: 'CANCELADA' } });
      expect(resultado.estado).toBe('CANCELADA');
    });
  });
});
