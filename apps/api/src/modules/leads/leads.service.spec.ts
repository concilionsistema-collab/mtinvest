import { Prisma } from '@prisma/client';
import { LeadsService } from './leads.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-007, US-008 e US-009 (ART-014) / RN-002, RN-003, RN-004 (ART-004).
describe('LeadsService', () => {
  const tenantId = 'tenant-1';
  const unidadeId = 'u1';

  interface TxMocks {
    unidadeFindFirst?: jest.Mock;
    pessoaFindFirst?: jest.Mock;
    pessoaCreate?: jest.Mock;
    leadFindFirst?: jest.Mock;
    leadCreate?: jest.Mock;
    leadUpdate?: jest.Mock;
    leadFindMany?: jest.Mock;
    usuarioFindMany?: jest.Mock;
    usuarioFindFirst?: jest.Mock;
    interacaoCreate?: jest.Mock;
    interacaoFindFirst?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }

  function criarServicoComTx(tx: TxMocks) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          unidade: { findFirst: tx.unidadeFindFirst },
          pessoa: { findFirst: tx.pessoaFindFirst, create: tx.pessoaCreate },
          lead: {
            findFirst: tx.leadFindFirst,
            create: tx.leadCreate,
            update: tx.leadUpdate,
            findMany: tx.leadFindMany ?? jest.fn().mockResolvedValue([]),
          },
          usuario: { findMany: tx.usuarioFindMany ?? jest.fn().mockResolvedValue([]), findFirst: tx.usuarioFindFirst },
          interacaoDeLead: {
            create: tx.interacaoCreate,
            findFirst: tx.interacaoFindFirst ?? jest.fn().mockResolvedValue(null),
          },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    return new LeadsService(tenantPrisma, new AuditoriaService(tenantPrisma));
  }

  const leadBase = {
    id: 'l1',
    tenantId,
    unidadeId,
    pessoaId: 'p1',
    responsavelUsuarioId: null,
    estado: 'EM_FILA_DE_DISTRIBUICAO',
    janelaExclusividadeFim: null,
    origemCanal: 'whatsapp',
    criadoEm: new Date('2026-08-01T00:00:00.000Z'),
  };

  describe('capturar (US-007/US-008)', () => {
    it('sem pessoa existente: cria pessoa e lead, e distribui para usuario ativo (RN-004)', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: unidadeId, tenantId });
      const pessoaFindFirst = jest.fn().mockResolvedValue(null);
      const pessoaCreate = jest.fn().mockResolvedValue({ id: 'p1', tenantId });
      const leadCreate = jest.fn().mockResolvedValue({ ...leadBase });
      const usuarioFindMany = jest.fn().mockResolvedValue([{ id: 'usr1', tenantId, unidadeId, status: 'ATIVO' }]);
      const leadFindFirst = jest.fn().mockResolvedValue(null); // ninguem tem lead anterior
      const leadUpdate = jest.fn().mockResolvedValue({
        ...leadBase,
        responsavelUsuarioId: 'usr1',
        estado: 'DISTRIBUIDO',
        janelaExclusividadeFim: new Date('2026-08-03T00:00:00.000Z'),
      });

      const service = criarServicoComTx({
        unidadeFindFirst,
        pessoaFindFirst,
        pessoaCreate,
        leadCreate,
        leadFindFirst,
        leadUpdate,
        usuarioFindMany,
      });

      const resultado = await service.capturar(tenantId, {
        unidadeId,
        nomeContato: 'Cliente Teste',
        telefone: '(11) 99999-0000',
        origemCanal: 'whatsapp',
      });

      expect(pessoaCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ telefoneNormalizado: '11999990000' }),
        }),
      );
      expect(resultado.duplicidadeDetectada).toBe(false);
      expect(resultado.lead.estado).toBe('DISTRIBUIDO');
      expect(resultado.lead.responsavelUsuarioId).toBe('usr1');
    });

    // PENDENCIA FECHADA (CA-002: atomicidade sob concorrencia). Simula a
    // corrida: primeira tentativa nao encontra Pessoa, mas colide na
    // constraint unica do banco (outra captura simultanea venceu). O
    // service refaz a operacao inteira uma vez - dessa vez encontra a
    // Pessoa que a vencedora criou.
    it('CA-002: corrida de concorrencia - P2002 na criacao de Pessoa refaz a operacao e trata como duplicidade', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: unidadeId, tenantId });
      const erroConstraintUnica = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });
      const pessoaFindFirst = jest
        .fn()
        .mockResolvedValueOnce(null) // 1a tentativa: ainda nao enxerga a pessoa da outra transacao
        .mockResolvedValueOnce({ id: 'p1', tenantId }); // 2a tentativa: ja enxerga (a outra ja commitou)
      const pessoaCreate = jest.fn().mockRejectedValueOnce(erroConstraintUnica);
      const leadFindFirst = jest.fn().mockResolvedValue({ ...leadBase, estado: 'DISTRIBUIDO' });
      const leadCreate = jest.fn();

      const service = criarServicoComTx({
        unidadeFindFirst,
        pessoaFindFirst,
        pessoaCreate,
        leadFindFirst,
        leadCreate,
      });

      const resultado = await service.capturar(tenantId, {
        unidadeId,
        nomeContato: 'Cliente Teste',
        telefone: '(11) 99999-0000',
        origemCanal: 'whatsapp',
      });

      expect(pessoaFindFirst).toHaveBeenCalledTimes(2);
      expect(leadCreate).not.toHaveBeenCalled(); // a 2a tentativa encontrou lead ativo - vira duplicidade, nao cria novo
      expect(resultado.duplicidadeDetectada).toBe(true);
    });

    it('erro que nao e violacao de constraint unica (P2002) propaga sem retry', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: unidadeId, tenantId });
      const pessoaFindFirst = jest.fn().mockRejectedValue(new Error('falha de conexao'));

      const service = criarServicoComTx({ unidadeFindFirst, pessoaFindFirst });

      await expect(
        service.capturar(tenantId, {
          unidadeId,
          nomeContato: 'Cliente Teste',
          telefone: '(11) 99999-0000',
          origemCanal: 'whatsapp',
        }),
      ).rejects.toThrow('falha de conexao');
      expect(pessoaFindFirst).toHaveBeenCalledTimes(1); // sem retry para erro que nao e a corrida esperada
    });

    it('RN-003: contato duplicado (mesmo telefone) e anexado ao lead existente, sem criar novo lead', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: unidadeId, tenantId });
      const pessoaFindFirst = jest.fn().mockResolvedValue({ id: 'p1', tenantId });
      const leadFindFirst = jest.fn().mockResolvedValue({ ...leadBase, estado: 'DISTRIBUIDO' });
      const leadCreate = jest.fn();

      const service = criarServicoComTx({ unidadeFindFirst, pessoaFindFirst, leadFindFirst, leadCreate });

      const resultado = await service.capturar(tenantId, {
        unidadeId,
        nomeContato: 'Cliente Teste',
        telefone: '(11) 99999-0000',
        origemCanal: 'site',
      });

      expect(leadCreate).not.toHaveBeenCalled();
      expect(resultado.duplicidadeDetectada).toBe(true);
      expect(resultado.lead.id).toBe('l1');
    });

    it('sem usuario ativo na unidade: lead permanece em fila (nao e erro)', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: unidadeId, tenantId });
      const pessoaFindFirst = jest.fn().mockResolvedValue(null);
      const pessoaCreate = jest.fn().mockResolvedValue({ id: 'p1', tenantId });
      const leadCreate = jest.fn().mockResolvedValue({ ...leadBase });
      const usuarioFindMany = jest.fn().mockResolvedValue([]);
      const leadUpdate = jest.fn();

      const service = criarServicoComTx({
        unidadeFindFirst,
        pessoaFindFirst,
        pessoaCreate,
        leadCreate,
        usuarioFindMany,
        leadUpdate,
      });

      const resultado = await service.capturar(tenantId, {
        unidadeId,
        nomeContato: 'Cliente Teste',
        origemCanal: 'site',
      });

      expect(leadUpdate).not.toHaveBeenCalled();
      expect(resultado.lead.estado).toBe('EM_FILA_DE_DISTRIBUICAO');
    });
  });

  describe('registrarInteracao (RN-004)', () => {
    it('contato qualificado com lead distribuido encerra a janela e move para "Em atendimento"', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({ ...leadBase, estado: 'DISTRIBUIDO' });
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId });
      const interacaoCreate = jest.fn().mockResolvedValue({
        id: 'int1',
        leadId: 'l1',
        usuarioId: 'usr1',
        tipo: 'CONTATO',
        qualificado: true,
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const leadUpdate = jest.fn().mockResolvedValue({});
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});

      const service = criarServicoComTx({
        leadFindFirst,
        usuarioFindFirst,
        interacaoCreate,
        leadUpdate,
        registroDeAuditoriaCreate,
      });

      await service.registrarInteracao(tenantId, 'l1', { tipo: 'CONTATO', qualificado: true }, 'usr1');

      expect(leadUpdate).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { estado: 'EM_ATENDIMENTO', janelaExclusividadeFim: null },
      });
      // ART-005, secao 9: escrita em Lead.estado gera RegistroDeAuditoria.
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId: 'usr1',
          acao: 'LEAD_ESTADO_ALTERADO',
          entidadeTipo: 'Lead',
          entidadeId: 'l1',
          motivo: 'DISTRIBUIDO->EM_ATENDIMENTO',
        },
      });
    });

    it('contato nao qualificado nao altera o estado do lead', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({ ...leadBase, estado: 'DISTRIBUIDO' });
      const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId });
      const interacaoCreate = jest.fn().mockResolvedValue({
        id: 'int1',
        leadId: 'l1',
        usuarioId: 'usr1',
        tipo: 'CONTATO',
        qualificado: false,
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const leadUpdate = jest.fn();

      const service = criarServicoComTx({ leadFindFirst, usuarioFindFirst, interacaoCreate, leadUpdate });

      await service.registrarInteracao(tenantId, 'l1', { tipo: 'CONTATO' }, 'usr1');

      expect(leadUpdate).not.toHaveBeenCalled();
    });
  });

  describe('listar / reabertura por SLA vencido (US-008 CA-002)', () => {
    it('reabre automaticamente lead distribuido cuja janela ja venceu', async () => {
      const leadVencido = {
        ...leadBase,
        estado: 'DISTRIBUIDO',
        responsavelUsuarioId: 'usr1',
        janelaExclusividadeFim: new Date('2020-01-01T00:00:00.000Z'),
      };
      const leadFindMany = jest
        .fn()
        .mockResolvedValueOnce([leadVencido]) // reabrirVencidos (estado DISTRIBUIDO)
        .mockResolvedValueOnce([]) // marcarInativosPorFaltaDeAtividade (estado EM_ATENDIMENTO)
        .mockResolvedValueOnce([{ ...leadBase, estado: 'EM_FILA_DE_DISTRIBUICAO' }]); // listagem final
      const leadUpdate = jest
        .fn()
        .mockResolvedValueOnce({ ...leadBase, estado: 'EM_FILA_DE_DISTRIBUICAO', responsavelUsuarioId: null });
      const usuarioFindMany = jest.fn().mockResolvedValue([]); // sem candidato -> fica em fila mesmo
      const leadFindFirst = jest.fn().mockResolvedValue(null);

      const service = criarServicoComTx({ leadFindMany, leadUpdate, usuarioFindMany, leadFindFirst });

      const leads = await service.listar(tenantId, unidadeId);

      expect(leadUpdate).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { estado: 'EM_FILA_DE_DISTRIBUICAO', responsavelUsuarioId: null, janelaExclusividadeFim: null },
      });
      expect(leads[0].estado).toBe('EM_FILA_DE_DISTRIBUICAO');
    });

    it('escopa a listagem pela unidade do chamador, nunca o tenant inteiro', async () => {
      const leadFindMany = jest
        .fn()
        .mockResolvedValueOnce([]) // reabrirVencidos
        .mockResolvedValueOnce([]) // marcarInativosPorFaltaDeAtividade
        .mockResolvedValueOnce([leadBase]); // listagem final
      const service = criarServicoComTx({ leadFindMany });

      await service.listar(tenantId, unidadeId);

      expect(leadFindMany).toHaveBeenNthCalledWith(3, { where: { tenantId, unidadeId }, orderBy: { criadoEm: 'asc' } });
    });
  });

  describe('reativacao apos inatividade (US-009)', () => {
    it('CA-001: recontato em lead INATIVO reabre para fila de distribuicao, sem criar lead novo', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: unidadeId, tenantId });
      const pessoaFindFirst = jest.fn().mockResolvedValue({ id: 'p1', tenantId });
      const leadFindFirst = jest.fn().mockResolvedValue({ ...leadBase, estado: 'INATIVO' });
      const leadUpdate = jest
        .fn()
        .mockResolvedValueOnce({ ...leadBase, estado: 'EM_FILA_DE_DISTRIBUICAO' });
      const leadCreate = jest.fn();
      const usuarioFindMany = jest.fn().mockResolvedValue([]); // sem candidato -> fica em fila mesmo, so nao cria lead novo

      const service = criarServicoComTx({
        unidadeFindFirst,
        pessoaFindFirst,
        leadFindFirst,
        leadUpdate,
        leadCreate,
        usuarioFindMany,
      });

      const resultado = await service.capturar(tenantId, {
        unidadeId,
        nomeContato: 'Cliente Antigo',
        telefone: '11999990000',
        origemCanal: 'whatsapp',
      });

      expect(leadCreate).not.toHaveBeenCalled();
      expect(leadUpdate).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { estado: 'EM_FILA_DE_DISTRIBUICAO' },
      });
      expect(resultado.reativado).toBe(true);
      expect(resultado.duplicidadeDetectada).toBe(false);
    });
  });
});
