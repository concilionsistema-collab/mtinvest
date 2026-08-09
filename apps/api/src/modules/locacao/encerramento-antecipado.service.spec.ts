import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EncerramentoAntecipadoService } from './encerramento-antecipado.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContratosLocacaoService } from './contratos-locacao.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

function decimal(valor: number) {
  return new Prisma.Decimal(valor);
}

const ENV_HABILITACAO = 'LOCACAO_MULTA_RESCISORIA_HABILITADA';

// Cobre US-111 (ART-015-backlog-fase-2.md) / RN-410, CA-405 (ART-010).
// BLOQUEADO PARA PRODUÇÃO REAL (ver comentário no service) - estes testes
// ligam a variável de ambiente só dentro do próprio teste, nunca globalmente.
describe('EncerramentoAntecipadoService', () => {
  const tenantId = 'tenant-1';
  const unidadeId = 'un-A';
  const gestor: UsuarioAutenticado = { id: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'usr2', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR' };

  const envOriginal = process.env[ENV_HABILITACAO];
  afterEach(() => {
    if (envOriginal === undefined) delete process.env[ENV_HABILITACAO];
    else process.env[ENV_HABILITACAO] = envOriginal;
  });

  function criarServicoComTx(tx: {
    contratoDeLocacaoFindFirst?: jest.Mock;
    encerramentoAntecipadoCreate?: jest.Mock;
    encerramentoAntecipadoFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          contratoDeLocacao: { findFirst: tx.contratoDeLocacaoFindFirst, update: jest.fn().mockResolvedValue({}) },
          encerramentoAntecipado: { create: tx.encerramentoAntecipadoCreate, findMany: tx.encerramentoAntecipadoFindMany },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);
    const contratosLocacaoService = { moverEstagioTx: jest.fn().mockResolvedValue({}) } as unknown as ContratosLocacaoService;

    return { service: new EncerramentoAntecipadoService(tenantPrisma, auditoriaService, contratosLocacaoService), contratosLocacaoService };
  }

  const hoje = new Date();
  const vencimentoEm10Meses = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 10, 1));

  const contratoVigente = {
    id: 'cl1',
    tenantId,
    estado: 'VIGENTE',
    valorAluguel: decimal(2000),
    prazoMeses: 12,
    vencimentoAtual: vencimentoEm10Meses,
  };

  describe('bloqueio de producao', () => {
    it('recusa QUALQUER chamada quando a variavel de ambiente nao esta "true", mesmo pra GESTOR_UNIDADE', async () => {
      delete process.env[ENV_HABILITACAO];
      const { service } = criarServicoComTx({});

      await expect(service.solicitar(tenantId, gestor, 'cl1', {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('recusa quando a variavel esta definida mas nao e exatamente "true"', async () => {
      process.env[ENV_HABILITACAO] = 'yes';
      const { service } = criarServicoComTx({});

      await expect(service.solicitar(tenantId, gestor, 'cl1', {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('solicitar (com o bloqueio habilitado para teste)', () => {
    beforeEach(() => {
      process.env[ENV_HABILITACAO] = 'true';
    });

    it('CORRETOR nao pode solicitar mesmo com o bloqueio habilitado', async () => {
      const { service } = criarServicoComTx({});

      await expect(service.solicitar(tenantId, corretor, 'cl1', {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('calcula a multa proporcional (10 de 12 meses restantes)', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const encerramentoAntecipadoCreate = jest.fn().mockResolvedValue({
        id: 'ea1',
        tenantId,
        contratoDeLocacaoId: 'cl1',
        valorReferencia: decimal(2000),
        mesesRestantes: 10,
        mesesTotais: 12,
        percentualProporcional: decimal(0.8333),
        valorMulta: decimal(1666.67),
        isento: false,
        motivoIsencao: null,
        confirmadoPorUsuarioId: gestor.id,
        criadoEm: new Date('2026-08-08T00:00:00.000Z'),
      });
      const { service, contratosLocacaoService } = criarServicoComTx({ contratoDeLocacaoFindFirst, encerramentoAntecipadoCreate });

      const resultado = await service.solicitar(tenantId, gestor, 'cl1', {});

      const dados = encerramentoAntecipadoCreate.mock.calls[0][0].data;
      expect(dados.mesesRestantes).toBe(10);
      expect(dados.mesesTotais).toBe(12);
      expect(dados.valorReferencia).toBe(2000);
      expect(dados.percentualProporcional).toBeCloseTo(10 / 12, 4);
      expect(dados.valorMulta).toBeCloseTo(2000 * (10 / 12), 2);
      expect(dados.isento).toBe(false);
      expect(contratosLocacaoService.moverEstagioTx).toHaveBeenCalledWith(
        expect.anything(),
        tenantId,
        'cl1',
        'EM_ENCERRAMENTO_ANTECIPADO',
        gestor.id,
      );
      expect(resultado.id).toBe('ea1');
    });

    it('RN-410: isento exige motivoIsencao (apuracao formal) - rejeita sem motivo', async () => {
      const { service } = criarServicoComTx({});

      await expect(service.solicitar(tenantId, gestor, 'cl1', { isento: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('RN-410: isento com motivo valido zera a multa', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const encerramentoAntecipadoCreate = jest.fn().mockResolvedValue({
        id: 'ea2',
        tenantId,
        contratoDeLocacaoId: 'cl1',
        valorReferencia: decimal(2000),
        mesesRestantes: 10,
        mesesTotais: 12,
        percentualProporcional: decimal(0),
        valorMulta: decimal(0),
        isento: true,
        motivoIsencao: 'Vício grave apurado em vistoria técnica',
        confirmadoPorUsuarioId: gestor.id,
        criadoEm: new Date('2026-08-08T00:00:00.000Z'),
      });
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, encerramentoAntecipadoCreate });

      await service.solicitar(tenantId, gestor, 'cl1', { isento: true, motivoIsencao: 'Vício grave apurado em vistoria técnica' });

      const dados = encerramentoAntecipadoCreate.mock.calls[0][0].data;
      expect(dados.isento).toBe(true);
      expect(dados.valorMulta).toBe(0);
      expect(dados.motivoIsencao).toBe('Vício grave apurado em vistoria técnica');
    });

    it('rejeita contrato que nao esta VIGENTE', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ ...contratoVigente, estado: 'RASCUNHO' });
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(service.solicitar(tenantId, gestor, 'cl1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita quando o contrato ja atingiu o vencimento (nao e mais "antecipado")', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ ...contratoVigente, vencimentoAtual: new Date('2020-01-01') });
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(service.solicitar(tenantId, gestor, 'cl1', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(service.solicitar(tenantId, gestor, 'cl-outro-tenant', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar', () => {
    it('lista mesmo com o bloqueio desligado (leitura nao e afetada pelo gate)', async () => {
      delete process.env[ENV_HABILITACAO];
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contratoVigente);
      const encerramentoAntecipadoFindMany = jest.fn().mockResolvedValue([]);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, encerramentoAntecipadoFindMany });

      const resultado = await service.listar(tenantId, unidadeId, 'cl1');

      expect(encerramentoAntecipadoFindMany).toHaveBeenCalledWith({
        where: { tenantId, contratoDeLocacaoId: 'cl1' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(resultado).toEqual([]);
    });
  });
});
