import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CarteirasService } from './carteiras.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-010, CA-002 (ART-014) / RN-008 (ART-004).
describe('CarteirasService', () => {
  const tenantId = 'tenant-1';
  const gestor: UsuarioAutenticado = { id: 'gestor1', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'cor1', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR' };

  interface TxMocks {
    transferenciaFindMany?: jest.Mock;
    transferenciaFindFirst?: jest.Mock;
    transferenciaUpdate?: jest.Mock;
    usuarioFindFirst?: jest.Mock;
    leadUpdate?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }

  function criarServicoComTx(tx: TxMocks) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          transferenciaDeCarteira: {
            // escalarVencidos (SchedulerService/checagem preguicosa) busca as
            // PENDENTE com SLA vencido no inicio de listarPendentes/decidir -
            // default vazio (nenhuma vencida) para nao afetar os demais testes.
            findMany: tx.transferenciaFindMany ?? jest.fn().mockResolvedValue([]),
            findFirst: tx.transferenciaFindFirst,
            update: tx.transferenciaUpdate,
          },
          usuario: { findFirst: tx.usuarioFindFirst },
          lead: { update: tx.leadUpdate },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    return new CarteirasService(tenantPrisma, new AuditoriaService(tenantPrisma));
  }

  describe('listarPendentes', () => {
    it('bloqueia corretor (so gestor de unidade decide destino)', async () => {
      const service = criarServicoComTx({});
      await expect(service.listarPendentes(tenantId, corretor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('gestor ve apenas transferencias de leads da propria unidade', async () => {
      const transferenciaFindMany = jest
        .fn()
        .mockResolvedValueOnce([]) // escalarVencidos - nenhuma PENDENTE com SLA vencido
        .mockResolvedValueOnce([
          {
            id: 't1',
            tenantId,
            leadId: 'l1',
            origemUsuarioId: 'usr1',
            destinoUsuarioId: null,
            estado: 'PENDENTE',
            motivo: 'desligamento com item em estagio avancado (PROPOSTA_ENVIADA) - RN-008/RN-009',
            slaDecisaoFim: new Date('2026-08-07T00:00:00.000Z'),
            criadoEm: new Date('2026-08-02T00:00:00.000Z'),
            decididoEm: null,
          },
        ]);
      const service = criarServicoComTx({ transferenciaFindMany });

      const resultado = await service.listarPendentes(tenantId, gestor);

      expect(transferenciaFindMany).toHaveBeenCalledWith({
        where: { tenantId, lead: { unidadeId: 'un-A' } },
        orderBy: { criadoEm: 'asc' },
      });
      expect(resultado).toHaveLength(1);
      expect(resultado[0].estado).toBe('PENDENTE');
    });
  });

  describe('decidir', () => {
    it('bloqueia corretor', async () => {
      const service = criarServicoComTx({});
      await expect(service.decidir(tenantId, 't1', 'destino1', corretor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404 quando a transferencia nao existe neste tenant', async () => {
      const transferenciaFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ transferenciaFindFirst });
      await expect(service.decidir(tenantId, 't1', 'destino1', gestor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('bloqueia gestor de outra unidade', async () => {
      const transferenciaFindFirst = jest.fn().mockResolvedValue({
        id: 't1',
        tenantId,
        leadId: 'l1',
        estado: 'PENDENTE',
        lead: { id: 'l1', unidadeId: 'un-B-outra-unidade' },
      });
      const service = criarServicoComTx({ transferenciaFindFirst });
      await expect(service.decidir(tenantId, 't1', 'destino1', gestor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('bloqueia decisao apos escalonamento a matriz (perfil inexistente nesta fatia)', async () => {
      const transferenciaFindFirst = jest.fn().mockResolvedValue({
        id: 't1',
        tenantId,
        leadId: 'l1',
        estado: 'ESCALADA_MATRIZ',
        lead: { id: 'l1', unidadeId: 'un-A' },
      });
      const service = criarServicoComTx({ transferenciaFindFirst });
      await expect(service.decidir(tenantId, 't1', 'destino1', gestor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('bloqueia decisao duplicada (ja transferida)', async () => {
      const transferenciaFindFirst = jest.fn().mockResolvedValue({
        id: 't1',
        tenantId,
        leadId: 'l1',
        estado: 'TRANSFERIDA',
        lead: { id: 'l1', unidadeId: 'un-A' },
      });
      const service = criarServicoComTx({ transferenciaFindFirst });
      await expect(service.decidir(tenantId, 't1', 'destino1', gestor)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita destino que nao e usuario ativo da mesma unidade do lead', async () => {
      const transferenciaFindFirst = jest.fn().mockResolvedValue({
        id: 't1',
        tenantId,
        leadId: 'l1',
        estado: 'PENDENTE',
        lead: { id: 'l1', unidadeId: 'un-A' },
      });
      const usuarioFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ transferenciaFindFirst, usuarioFindFirst });
      await expect(service.decidir(tenantId, 't1', 'destino-invalido', gestor)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('CA-002: gestor decide destino dentro do SLA - transfere lead e audita', async () => {
      const transferenciaFindFirst = jest.fn().mockResolvedValue({
        id: 't1',
        tenantId,
        leadId: 'l1',
        estado: 'PENDENTE',
        lead: { id: 'l1', unidadeId: 'un-A' },
      });
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'destino1', tenantId, unidadeId: 'un-A', status: 'ATIVO' });
      const leadUpdate = jest.fn().mockResolvedValue({});
      const transferenciaUpdate = jest.fn().mockResolvedValue({
        id: 't1',
        tenantId,
        leadId: 'l1',
        origemUsuarioId: 'usr1',
        destinoUsuarioId: 'destino1',
        estado: 'TRANSFERIDA',
        motivo: 'desligamento com item em estagio avancado (PROPOSTA_ENVIADA) - RN-008/RN-009',
        slaDecisaoFim: new Date('2026-08-07T00:00:00.000Z'),
        criadoEm: new Date('2026-08-02T00:00:00.000Z'),
        decididoEm: new Date('2026-08-03T00:00:00.000Z'),
      });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});

      const service = criarServicoComTx({
        transferenciaFindFirst,
        usuarioFindFirst,
        leadUpdate,
        transferenciaUpdate,
        registroDeAuditoriaCreate,
      });

      const resultado = await service.decidir(tenantId, 't1', 'destino1', gestor);

      expect(leadUpdate).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { responsavelUsuarioId: 'destino1' },
      });
      expect(transferenciaUpdate).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { estado: 'TRANSFERIDA', destinoUsuarioId: 'destino1', decididoEm: expect.any(Date) },
      });
      expect(registroDeAuditoriaCreate).toHaveBeenCalledTimes(2);
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId: 'gestor1',
          acao: 'TRANSFERENCIA_CARTEIRA_DECIDIDA',
          entidadeTipo: 'TransferenciaDeCarteira',
          entidadeId: 't1',
          motivo: 'destino=destino1',
        },
      });
      expect(resultado.estado).toBe('TRANSFERIDA');
      expect(resultado.destinoUsuarioId).toBe('destino1');
    });
  });

  // PENDENCIA DE AUDITORIA FECHADA (ator sistema, ver SchedulerService).
  describe('escalonamento por SLA vencido (ator sistema)', () => {
    it('audita cada item escalado com atorUsuarioId nulo', async () => {
      const transferenciaFindMany = jest
        .fn()
        .mockResolvedValueOnce([
          { id: 't-vencida', tenantId, leadId: 'l1', estado: 'PENDENTE', slaDecisaoFim: new Date('2020-01-01') },
        ]) // escalarVencidos
        .mockResolvedValueOnce([]); // listagem final (nao testada aqui)
      const transferenciaUpdate = jest.fn().mockResolvedValue({});
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ transferenciaFindMany, transferenciaUpdate, registroDeAuditoriaCreate });

      await service.listarPendentes(tenantId, gestor);

      expect(transferenciaUpdate).toHaveBeenCalledWith({ where: { id: 't-vencida' }, data: { estado: 'ESCALADA_MATRIZ' } });
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId: null,
          acao: 'TRANSFERENCIA_CARTEIRA_ESCALADA',
          entidadeTipo: 'TransferenciaDeCarteira',
          entidadeId: 't-vencida',
          motivo: 'PENDENTE->ESCALADA_MATRIZ (SLA de decisao vencido, RN-008)',
        },
      });
    });
  });
});
