import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OportunidadesService } from './oportunidades.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { ChecklistService } from '../checklist/checklist.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-011, US-012, US-013 e US-020 (ART-014) / RN-301, RN-307, RN-309, RN-312 (ART-009).
describe('OportunidadesService', () => {
  const tenantId = 'tenant-1';

  interface TxMocks {
    leadFindFirst?: jest.Mock;
    imovelFindFirst?: jest.Mock;
    oportunidadeFindFirst?: jest.Mock;
    oportunidadeFindMany?: jest.Mock;
    oportunidadeCreate?: jest.Mock;
    oportunidadeUpdate?: jest.Mock;
    interacaoCount?: jest.Mock;
    interacaoCreate?: jest.Mock;
    usuarioFindFirst?: jest.Mock;
    comissaoCruzadaCreate?: jest.Mock;
    comissaoCruzadaFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }

  function criarServicoComTx(tx: TxMocks, checklistServiceMock?: Partial<ChecklistService>) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          // Default: chamador 'usr1' e sempre o responsavel pelo lead, para
          // nao quebrar os testes ja existentes de moverEstagio/registrarTentativaDeContato
          // (que nao testavam RN-312/validarResponsavelDaOportunidade antes desta
          // pendencia ser fechada) - sobrescrito explicitamente nos poucos
          // testes que exercitam o bloqueio em si.
          lead: { findFirst: tx.leadFindFirst ?? jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' }) },
          imovel: { findFirst: tx.imovelFindFirst },
          oportunidade: {
            findFirst: tx.oportunidadeFindFirst,
            findMany: tx.oportunidadeFindMany,
            create: tx.oportunidadeCreate,
            update: tx.oportunidadeUpdate,
          },
          interacaoDeLead: { count: tx.interacaoCount, create: tx.interacaoCreate },
          usuario: { findFirst: tx.usuarioFindFirst },
          comissaoCruzadaAcionada: { create: tx.comissaoCruzadaCreate, findMany: tx.comissaoCruzadaFindMany },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const checklistService = {
      estaCompletoTx: jest.fn().mockResolvedValue(true),
      ...checklistServiceMock,
    } as unknown as ChecklistService;

    return new OportunidadesService(tenantPrisma, checklistService, new AuditoriaService(tenantPrisma));
  }

  describe('listar (escopo por unidade do lead)', () => {
    it('escopa a query pela unidade do lead, nunca o tenant inteiro sem filtro', async () => {
      const oportunidadeFindMany = jest.fn().mockResolvedValue([]);
      const service = criarServicoComTx({ oportunidadeFindMany });

      await service.listar(tenantId, 'u1');

      expect(oportunidadeFindMany).toHaveBeenCalledWith({
        where: { tenantId, lead: { unidadeId: 'u1' } },
        orderBy: { criadoEm: 'asc' },
      });
    });
  });

  describe('criar (US-012)', () => {
    it('CA-001: cria em estado QUALIFICACAO quando o requisitante e o responsavel pelo lead', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'imv1', tenantId });
      const oportunidadeFindFirst = jest.fn().mockResolvedValue(null);
      const oportunidadeCreate = jest.fn().mockResolvedValue({
        id: 'op1',
        tenantId,
        leadId: 'lead1',
        imovelId: 'imv1',
        estado: 'QUALIFICACAO',
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({
        leadFindFirst,
        imovelFindFirst,
        oportunidadeFindFirst,
        oportunidadeCreate,
        registroDeAuditoriaCreate,
      });

      const resultado = await service.criar(tenantId, { leadId: 'lead1', imovelId: 'imv1' }, 'usr1');

      expect(resultado.estado).toBe('QUALIFICACAO');
      // US-012, "criação é auditada":
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId: 'usr1',
          acao: 'OPORTUNIDADE_CRIADA',
          entidadeTipo: 'Oportunidade',
          entidadeId: 'op1',
          motivo: undefined,
        },
      });
    });

    it('CA-002: bloqueia criacao por quem nao e o responsavel pelo lead', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const oportunidadeCreate = jest.fn();
      const service = criarServicoComTx({ leadFindFirst, oportunidadeCreate });

      await expect(
        service.criar(tenantId, { leadId: 'lead1', imovelId: 'imv1' }, 'outro-corretor'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(oportunidadeCreate).not.toHaveBeenCalled();
    });

    it('bloqueia duplicidade de oportunidade ativa para o mesmo lead+imovel', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'imv1', tenantId });
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op-existente' });
      const oportunidadeCreate = jest.fn();
      const service = criarServicoComTx({ leadFindFirst, imovelFindFirst, oportunidadeFindFirst, oportunidadeCreate });

      await expect(
        service.criar(tenantId, { leadId: 'lead1', imovelId: 'imv1' }, 'usr1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(oportunidadeCreate).not.toHaveBeenCalled();
    });
  });

  describe('moverEstagio (US-011)', () => {
    it('CA-001 (implicito): aceita transicao valida do mapa de estados', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'QUALIFICACAO', imovelId: 'imv1', leadId: 'lead1' });
      const oportunidadeUpdate = jest.fn().mockResolvedValue({
        id: 'op1',
        tenantId,
        leadId: 'lead1',
        imovelId: 'imv1',
        estado: 'VISITA_AGENDADA',
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ oportunidadeFindFirst, oportunidadeUpdate, registroDeAuditoriaCreate });

      const resultado = await service.moverEstagio(tenantId, 'op1', 'VISITA_AGENDADA', 'usr1');

      expect(resultado.estado).toBe('VISITA_AGENDADA');
      // ART-005, secao 9 (espirito da regra): toda transicao de Oportunidade.estado
      // gera RegistroDeAuditoria, via o chokepoint unico moverEstagioTx.
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId: 'usr1',
          acao: 'OPORTUNIDADE_ESTADO_ALTERADO',
          entidadeTipo: 'Oportunidade',
          entidadeId: 'op1',
          motivo: 'QUALIFICACAO->VISITA_AGENDADA',
        },
      });
    });

    it('CA-002: rejeita transicao fora do mapa de estados (ART-009, secao 8.1)', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'QUALIFICACAO', imovelId: 'imv1', leadId: 'lead1' });
      const oportunidadeUpdate = jest.fn();
      const service = criarServicoComTx({ oportunidadeFindFirst, oportunidadeUpdate });

      await expect(service.moverEstagio(tenantId, 'op1', 'RESERVA', 'usr1')).rejects.toBeInstanceOf(BadRequestException);
      expect(oportunidadeUpdate).not.toHaveBeenCalled();
    });

    it('RN-307: rejeita mover para RESERVA se o imovel ja tem outra oportunidade reservada', async () => {
      const opBase = { id: 'op2', tenantId, estado: 'PROPOSTA_ENVIADA', imovelId: 'imv1', leadId: 'lead2' };
      const oportunidadeFindFirst = jest
        .fn()
        .mockResolvedValueOnce(opBase) // validarResponsavelDaOportunidade
        .mockResolvedValueOnce(opBase) // moverEstagioTx
        .mockResolvedValueOnce({ id: 'op-outra-reservada' }); // checagem RN-307
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead2', tenantId, responsavelUsuarioId: 'usr1' });
      const oportunidadeUpdate = jest.fn();
      const service = criarServicoComTx({ oportunidadeFindFirst, leadFindFirst, oportunidadeUpdate });

      await expect(service.moverEstagio(tenantId, 'op2', 'RESERVA', 'usr1')).rejects.toBeInstanceOf(BadRequestException);
      expect(oportunidadeUpdate).not.toHaveBeenCalled();
    });

    it('US-013 CA-001: rejeita mover para PERDIDA sem o minimo de tentativas de contato', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'QUALIFICACAO', imovelId: 'imv1', leadId: 'lead1' });
      const interacaoCount = jest.fn().mockResolvedValue(1);
      const oportunidadeUpdate = jest.fn();
      const service = criarServicoComTx({ oportunidadeFindFirst, interacaoCount, oportunidadeUpdate });

      await expect(service.moverEstagio(tenantId, 'op1', 'PERDIDA', 'usr1')).rejects.toBeInstanceOf(BadRequestException);
      expect(oportunidadeUpdate).not.toHaveBeenCalled();
    });

    it('permite mover para PERDIDA quando ha tentativas suficientes', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'QUALIFICACAO', imovelId: 'imv1', leadId: 'lead1' });
      const interacaoCount = jest.fn().mockResolvedValue(3);
      const oportunidadeUpdate = jest.fn().mockResolvedValue({
        id: 'op1',
        tenantId,
        leadId: 'lead1',
        imovelId: 'imv1',
        estado: 'PERDIDA',
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const service = criarServicoComTx({ oportunidadeFindFirst, interacaoCount, oportunidadeUpdate });

      const resultado = await service.moverEstagio(tenantId, 'op1', 'PERDIDA', 'usr1');
      expect(resultado.estado).toBe('PERDIDA');
    });

    it('oportunidade de outro tenant nao e encontrada (404)', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ oportunidadeFindFirst });

      await expect(service.moverEstagio(tenantId, 'op-de-outro-tenant', 'VISITA_AGENDADA', 'usr1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('PENDENCIA FECHADA (Permissões, US-011): rejeita quem nao e o responsavel pelo lead da oportunidade', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, estado: 'QUALIFICACAO', imovelId: 'imv1', leadId: 'lead1' });
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const oportunidadeUpdate = jest.fn();
      const service = criarServicoComTx({ oportunidadeFindFirst, leadFindFirst, oportunidadeUpdate });

      await expect(service.moverEstagio(tenantId, 'op1', 'VISITA_AGENDADA', 'outro-usuario')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(oportunidadeUpdate).not.toHaveBeenCalled();
    });
  });

  describe('registrarTentativaDeContato (US-013)', () => {
    it('registra a tentativa e retorna a contagem atualizada', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, leadId: 'lead1' });
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId });
      const interacaoCreate = jest.fn().mockResolvedValue({});
      const interacaoCount = jest.fn().mockResolvedValue(2);
      const service = criarServicoComTx({
        oportunidadeFindFirst,
        usuarioFindFirst,
        interacaoCreate,
        interacaoCount,
      });

      const resultado = await service.registrarTentativaDeContato(tenantId, 'op1', 'usr1');

      expect(interacaoCreate).toHaveBeenCalledWith({
        data: { tenantId, leadId: 'lead1', usuarioId: 'usr1', tipo: 'CONTATO', qualificado: false },
      });
      expect(resultado.tentativasRegistradas).toBe(2);
    });
  });

  describe('moverEstagio para DOCUMENTACAO_CONCLUIDA (US-019, CA-001)', () => {
    it('bloqueia a transicao quando o checklist nao esta completo (RN-308)', async () => {
      const oportunidadeFindFirst = jest
        .fn()
        .mockResolvedValue({ id: 'op1', tenantId, estado: 'RESERVA', imovelId: 'imv1', leadId: 'lead1' });
      const oportunidadeUpdate = jest.fn();
      const estaCompletoTx = jest.fn().mockResolvedValue(false);
      const service = criarServicoComTx({ oportunidadeFindFirst, oportunidadeUpdate }, { estaCompletoTx });

      await expect(
        service.moverEstagio(tenantId, 'op1', 'DOCUMENTACAO_CONCLUIDA', 'usr1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(oportunidadeUpdate).not.toHaveBeenCalled();
    });

    it('permite a transicao quando o checklist esta completo', async () => {
      const oportunidadeFindFirst = jest
        .fn()
        .mockResolvedValue({ id: 'op1', tenantId, estado: 'RESERVA', imovelId: 'imv1', leadId: 'lead1' });
      const oportunidadeUpdate = jest.fn().mockResolvedValue({
        id: 'op1',
        tenantId,
        leadId: 'lead1',
        imovelId: 'imv1',
        estado: 'DOCUMENTACAO_CONCLUIDA',
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const estaCompletoTx = jest.fn().mockResolvedValue(true);
      const service = criarServicoComTx({ oportunidadeFindFirst, oportunidadeUpdate }, { estaCompletoTx });

      const resultado = await service.moverEstagio(tenantId, 'op1', 'DOCUMENTACAO_CONCLUIDA', 'usr1');
      expect(resultado.estado).toBe('DOCUMENTACAO_CONCLUIDA');
    });
  });

  describe('fechar (US-020)', () => {
    it('CA-001: fecha e nao aciona comissao cruzada quando imovel e do mesmo unidade do lead', async () => {
      const oportunidadeFindFirst = jest
        .fn()
        .mockResolvedValue({ id: 'op1', tenantId, estado: 'DOCUMENTACAO_CONCLUIDA', imovelId: 'imv1', leadId: 'lead1' });
      const leadFindFirst = jest
        .fn()
        .mockResolvedValue({ id: 'lead1', tenantId, unidadeId: 'un-A', responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'imv1', tenantId, unidadeProprietariaId: 'un-A' });
      const oportunidadeUpdate = jest.fn().mockResolvedValue({
        id: 'op1',
        tenantId,
        leadId: 'lead1',
        imovelId: 'imv1',
        estado: 'FECHADA',
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const comissaoCruzadaCreate = jest.fn();
      const service = criarServicoComTx({
        oportunidadeFindFirst,
        leadFindFirst,
        imovelFindFirst,
        oportunidadeUpdate,
        comissaoCruzadaCreate,
      });

      const resultado = await service.fechar(tenantId, 'op1', 'usr1');

      expect(resultado.estado).toBe('FECHADA');
      expect(comissaoCruzadaCreate).not.toHaveBeenCalled();
    });

    it('CA-002: aciona registro de comissao cruzada quando imovel e de unidade diferente do lead (RN-309)', async () => {
      const oportunidadeFindFirst = jest
        .fn()
        .mockResolvedValue({ id: 'op1', tenantId, estado: 'DOCUMENTACAO_CONCLUIDA', imovelId: 'imv1', leadId: 'lead1' });
      const leadFindFirst = jest
        .fn()
        .mockResolvedValue({ id: 'lead1', tenantId, unidadeId: 'un-A', responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'imv1', tenantId, unidadeProprietariaId: 'un-B' });
      const oportunidadeUpdate = jest.fn().mockResolvedValue({
        id: 'op1',
        tenantId,
        leadId: 'lead1',
        imovelId: 'imv1',
        estado: 'FECHADA',
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const comissaoCruzadaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({
        oportunidadeFindFirst,
        leadFindFirst,
        imovelFindFirst,
        oportunidadeUpdate,
        comissaoCruzadaCreate,
      });

      const resultado = await service.fechar(tenantId, 'op1', 'usr1');

      expect(resultado.estado).toBe('FECHADA');
      expect(comissaoCruzadaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          oportunidadeId: 'op1',
          unidadeProprietariaImovelId: 'un-B',
          unidadeResponsavelLeadId: 'un-A',
        },
      });
    });

    it('bloqueia fechamento por quem nao e o responsavel pela oportunidade', async () => {
      const oportunidadeFindFirst = jest
        .fn()
        .mockResolvedValue({ id: 'op1', tenantId, estado: 'DOCUMENTACAO_CONCLUIDA', imovelId: 'imv1', leadId: 'lead1' });
      const leadFindFirst = jest
        .fn()
        .mockResolvedValue({ id: 'lead1', tenantId, unidadeId: 'un-A', responsavelUsuarioId: 'usr1' });
      const oportunidadeUpdate = jest.fn();
      const service = criarServicoComTx({ oportunidadeFindFirst, leadFindFirst, oportunidadeUpdate });

      await expect(service.fechar(tenantId, 'op1', 'outro-usuario')).rejects.toBeInstanceOf(BadRequestException);
      expect(oportunidadeUpdate).not.toHaveBeenCalled();
    });
  });
});
