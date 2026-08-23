import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { FinanceiroService } from './financeiro.service';

// Cobre o motor financeiro manual (livro-razao, DEC-ARQ-006): escopo por
// unidade do ator, restricao a GESTOR_UNIDADE, e as transicoes de estado
// (liquidar/cancelar so a partir de PENDENTE).
describe('FinanceiroService', () => {
  const tenantId = 'tenant-1';
  const gestor: UsuarioAutenticado = { id: 'usr1', tenantId, unidadeId: 'unidade-1', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'usr2', tenantId, unidadeId: 'unidade-1', perfil: 'CORRETOR' };

  function criarServicoComTx(tx: {
    lancamentoCreate?: jest.Mock;
    lancamentoFindMany?: jest.Mock;
    lancamentoFindFirst?: jest.Mock;
    lancamentoUpdate?: jest.Mock;
    pessoaFindFirst?: jest.Mock;
    oportunidadeFindFirst?: jest.Mock;
    contratoDeLocacaoFindFirst?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          lancamentoFinanceiro: {
            create: tx.lancamentoCreate,
            findMany: tx.lancamentoFindMany,
            findFirst: tx.lancamentoFindFirst,
            update: tx.lancamentoUpdate,
          },
          pessoa: { findFirst: tx.pessoaFindFirst ?? jest.fn().mockResolvedValue({ id: 'p1' }) },
          oportunidade: { findFirst: tx.oportunidadeFindFirst ?? jest.fn().mockResolvedValue({ id: 'o1' }) },
          contratoDeLocacao: { findFirst: tx.contratoDeLocacaoFindFirst ?? jest.fn().mockResolvedValue({ id: 'c1' }) },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);

    return new FinanceiroService(tenantPrisma, auditoriaService);
  }

  const lancamentoBase = {
    id: 'l1',
    tenantId,
    unidadeId: 'unidade-1',
    tipo: 'A_RECEBER',
    categoria: 'ALUGUEL',
    descricao: 'Aluguel de agosto',
    valor: { toNumber: () => 1500 },
    vencimento: new Date('2026-08-10T00:00:00.000Z'),
    status: 'PENDENTE',
    dataLiquidacao: null,
    liquidadoPorUsuarioId: null,
    canceladoEm: null,
    canceladoPorUsuarioId: null,
    motivoCancelamento: null,
    contraparte: 'Fulano',
    pessoaId: null,
    oportunidadeId: null,
    contratoDeLocacaoId: null,
    observacoes: null,
    criadoPorUsuarioId: 'usr1',
    criadoEm: new Date('2026-08-01T00:00:00.000Z'),
  };

  describe('acesso restrito a GESTOR_UNIDADE', () => {
    it('rejeita listar para CORRETOR', async () => {
      const service = criarServicoComTx({});
      await expect(service.listar(tenantId, corretor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejeita criar para CORRETOR', async () => {
      const service = criarServicoComTx({});
      await expect(
        service.criar(tenantId, corretor, {
          tipo: 'A_RECEBER',
          categoria: 'ALUGUEL',
          descricao: 'x',
          valor: 100,
          vencimento: '2026-08-10',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('criar', () => {
    it('cria o lançamento com a unidade do ator (nunca do input) e audita', async () => {
      const lancamentoCreate = jest.fn().mockResolvedValue(lancamentoBase);
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ lancamentoCreate, registroDeAuditoriaCreate });

      const resultado = await service.criar(tenantId, gestor, {
        tipo: 'A_RECEBER',
        categoria: 'ALUGUEL',
        descricao: 'Aluguel de agosto',
        valor: 1500,
        vencimento: '2026-08-10',
        contraparte: 'Fulano',
      });

      expect(lancamentoCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId, unidadeId: gestor.unidadeId, criadoPorUsuarioId: gestor.id }),
      });
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ acao: 'LANCAMENTO_FINANCEIRO_CRIADO', entidadeTipo: 'LancamentoFinanceiro' }),
      });
      expect(resultado.valor).toBe(1500);
    });

    it('rejeita quando pessoaId informado não existe no tenant', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ pessoaFindFirst });

      await expect(
        service.criar(tenantId, gestor, {
          tipo: 'A_RECEBER',
          categoria: 'ALUGUEL',
          descricao: 'x',
          valor: 100,
          vencimento: '2026-08-10',
          pessoaId: 'p-outro-tenant',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('liquidar', () => {
    it('marca como liquidado e audita', async () => {
      const lancamentoFindFirst = jest.fn().mockResolvedValue(lancamentoBase);
      const lancamentoUpdate = jest.fn().mockResolvedValue({ ...lancamentoBase, status: 'LIQUIDADO' });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ lancamentoFindFirst, lancamentoUpdate, registroDeAuditoriaCreate });

      const resultado = await service.liquidar(tenantId, gestor, 'l1');

      expect(lancamentoFindFirst).toHaveBeenCalledWith({
        where: { id: 'l1', tenantId, unidadeId: gestor.unidadeId },
      });
      expect(lancamentoUpdate).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { status: 'LIQUIDADO', dataLiquidacao: expect.any(Date), liquidadoPorUsuarioId: gestor.id },
      });
      expect(resultado.status).toBe('LIQUIDADO');
    });

    it('rejeita liquidar um lançamento que não é da unidade do ator', async () => {
      const lancamentoFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ lancamentoFindFirst });

      await expect(service.liquidar(tenantId, gestor, 'l-outra-unidade')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita liquidar um lançamento já cancelado', async () => {
      const lancamentoFindFirst = jest.fn().mockResolvedValue({ ...lancamentoBase, status: 'CANCELADO' });
      const lancamentoUpdate = jest.fn();
      const service = criarServicoComTx({ lancamentoFindFirst, lancamentoUpdate });

      await expect(service.liquidar(tenantId, gestor, 'l1')).rejects.toBeInstanceOf(BadRequestException);
      expect(lancamentoUpdate).not.toHaveBeenCalled();
    });
  });

  describe('cancelar', () => {
    it('marca como cancelado com motivo e audita', async () => {
      const lancamentoFindFirst = jest.fn().mockResolvedValue(lancamentoBase);
      const lancamentoUpdate = jest.fn().mockResolvedValue({ ...lancamentoBase, status: 'CANCELADO' });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ lancamentoFindFirst, lancamentoUpdate, registroDeAuditoriaCreate });

      const resultado = await service.cancelar(tenantId, gestor, 'l1', 'lançado por engano');

      expect(lancamentoUpdate).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: {
          status: 'CANCELADO',
          canceladoEm: expect.any(Date),
          canceladoPorUsuarioId: gestor.id,
          motivoCancelamento: 'lançado por engano',
        },
      });
      expect(resultado.status).toBe('CANCELADO');
    });

    it('rejeita cancelar um lançamento já liquidado', async () => {
      const lancamentoFindFirst = jest.fn().mockResolvedValue({ ...lancamentoBase, status: 'LIQUIDADO' });
      const lancamentoUpdate = jest.fn();
      const service = criarServicoComTx({ lancamentoFindFirst, lancamentoUpdate });

      await expect(service.cancelar(tenantId, gestor, 'l1', 'motivo')).rejects.toBeInstanceOf(BadRequestException);
      expect(lancamentoUpdate).not.toHaveBeenCalled();
    });
  });

  describe('resumo', () => {
    it('separa pendente/atrasado/liquidado-no-mês por tipo', async () => {
      const agora = new Date();
      const passado = new Date(agora.getTime() - 5 * 24 * 60 * 60 * 1000);
      const futuro = new Date(agora.getTime() + 5 * 24 * 60 * 60 * 1000);
      const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
      const dentroDoMes = new Date(inicioDoMes.getTime() + 2 * 24 * 60 * 60 * 1000);

      const lancamentoFindMany = jest.fn().mockResolvedValue([
        { tipo: 'A_RECEBER', status: 'PENDENTE', valor: { toNumber: () => 100 }, vencimento: futuro, dataLiquidacao: null },
        { tipo: 'A_RECEBER', status: 'PENDENTE', valor: { toNumber: () => 200 }, vencimento: passado, dataLiquidacao: null },
        { tipo: 'A_PAGAR', status: 'PENDENTE', valor: { toNumber: () => 50 }, vencimento: passado, dataLiquidacao: null },
        { tipo: 'A_PAGAR', status: 'LIQUIDADO', valor: { toNumber: () => 300 }, vencimento: passado, dataLiquidacao: dentroDoMes },
        { tipo: 'A_RECEBER', status: 'CANCELADO', valor: { toNumber: () => 999 }, vencimento: futuro, dataLiquidacao: null },
      ]);
      const service = criarServicoComTx({ lancamentoFindMany });

      const resumo = await service.resumo(tenantId, gestor);

      expect(resumo.totalPendenteAReceber).toBe(300);
      expect(resumo.totalPendenteAPagar).toBe(50);
      expect(resumo.totalAtrasadoAReceber).toBe(200);
      expect(resumo.totalAtrasadoAPagar).toBe(50);
      expect(resumo.totalLiquidadoNoMesAPagar).toBe(300);
      expect(resumo.totalLiquidadoNoMesAReceber).toBe(0);
    });
  });
});
