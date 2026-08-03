import { BadRequestException } from '@nestjs/common';
import { ContratosLocacaoService } from './contratos-locacao.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-102 (ART-015-backlog-fase-2.md) / RN-401 (ART-010).
describe('ContratosLocacaoService', () => {
  const tenantId = 'tenant-1';

  function criarServicoComTx(tx: {
    contratoDeAdministracaoFindFirst?: jest.Mock;
    imovelFindFirst?: jest.Mock;
    pessoaFindFirst?: jest.Mock;
    contratoDeLocacaoCreate?: jest.Mock;
    contratoDeLocacaoFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          contratoDeAdministracao: { findFirst: tx.contratoDeAdministracaoFindFirst },
          imovel: { findFirst: tx.imovelFindFirst },
          pessoa: { findFirst: tx.pessoaFindFirst },
          contratoDeLocacao: { create: tx.contratoDeLocacaoCreate, findMany: tx.contratoDeLocacaoFindMany },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);

    return { service: new ContratosLocacaoService(tenantPrisma, auditoriaService) };
  }

  const inputBase = {
    contratoDeAdministracaoId: 'ca1',
    inquilinoPessoaId: 'pe2',
    valorAluguel: 2500,
    diaVencimento: 10,
    indiceReajuste: 'IGPM' as const,
    aceitaReajusteNegativo: false,
    dataInicio: '2026-09-01',
    prazoMeses: 30,
  };

  const administracaoAtiva = { id: 'ca1', tenantId, imovelId: 'im1', status: 'ATIVO' };
  const imovelParaLocacao = { id: 'im1', tenantId, finalidade: 'LOCACAO' };

  const contratoLocacaoRecord = {
    id: 'cl1',
    tenantId,
    contratoDeAdministracaoId: 'ca1',
    inquilinoPessoaId: 'pe2',
    estado: 'RASCUNHO',
    valorAluguel: { toNumber: () => 2500 },
    diaVencimento: 10,
    indiceReajuste: 'IGPM',
    aceitaReajusteNegativo: false,
    dataInicio: new Date('2026-09-01T00:00:00.000Z'),
    prazoMeses: 30,
    criadoEm: new Date('2026-08-02T00:00:00.000Z'),
  };

  describe('criar', () => {
    it('cria o contrato em RASCUNHO quando a administracao esta ativa e o imovel aceita locacao', async () => {
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(administracaoAtiva);
      const imovelFindFirst = jest.fn().mockResolvedValue(imovelParaLocacao);
      const pessoaFindFirst = jest.fn().mockResolvedValue({ id: 'pe2', tenantId });
      const contratoDeLocacaoCreate = jest.fn().mockResolvedValue(contratoLocacaoRecord);
      const { service } = criarServicoComTx({
        contratoDeAdministracaoFindFirst,
        imovelFindFirst,
        pessoaFindFirst,
        contratoDeLocacaoCreate,
      });

      const resultado = await service.criar(tenantId, 'usr1', inputBase);

      expect(contratoDeLocacaoCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          contratoDeAdministracaoId: 'ca1',
          inquilinoPessoaId: 'pe2',
          valorAluguel: 2500,
          diaVencimento: 10,
          indiceReajuste: 'IGPM',
          aceitaReajusteNegativo: false,
          dataInicio: new Date('2026-09-01'),
          prazoMeses: 30,
        },
      });
      expect(resultado.estado).toBe('RASCUNHO');
      expect(resultado.valorAluguel).toBe(2500);
    });

    it('RN-401: rejeita quando o contrato de administracao nao existe no tenant', async () => {
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(null);
      const contratoDeLocacaoCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeAdministracaoFindFirst, contratoDeLocacaoCreate });

      await expect(service.criar(tenantId, 'usr1', inputBase)).rejects.toBeInstanceOf(BadRequestException);
      expect(contratoDeLocacaoCreate).not.toHaveBeenCalled();
    });

    it('RN-401: rejeita quando o contrato de administracao nao esta ATIVO', async () => {
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue({ ...administracaoAtiva, status: 'ENCERRADO' });
      const contratoDeLocacaoCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeAdministracaoFindFirst, contratoDeLocacaoCreate });

      await expect(service.criar(tenantId, 'usr1', inputBase)).rejects.toBeInstanceOf(BadRequestException);
      expect(contratoDeLocacaoCreate).not.toHaveBeenCalled();
    });

    it('rejeita quando o imovel tem finalidade VENDA (nao aceita locacao)', async () => {
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(administracaoAtiva);
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'im1', tenantId, finalidade: 'VENDA' });
      const contratoDeLocacaoCreate = jest.fn();
      const { service } = criarServicoComTx({ contratoDeAdministracaoFindFirst, imovelFindFirst, contratoDeLocacaoCreate });

      await expect(service.criar(tenantId, 'usr1', inputBase)).rejects.toBeInstanceOf(BadRequestException);
      expect(contratoDeLocacaoCreate).not.toHaveBeenCalled();
    });

    it('aceita imovel com finalidade AMBOS', async () => {
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(administracaoAtiva);
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'im1', tenantId, finalidade: 'AMBOS' });
      const pessoaFindFirst = jest.fn().mockResolvedValue({ id: 'pe2', tenantId });
      const contratoDeLocacaoCreate = jest.fn().mockResolvedValue(contratoLocacaoRecord);
      const { service } = criarServicoComTx({
        contratoDeAdministracaoFindFirst,
        imovelFindFirst,
        pessoaFindFirst,
        contratoDeLocacaoCreate,
      });

      await expect(service.criar(tenantId, 'usr1', inputBase)).resolves.toBeDefined();
    });

    it('rejeita quando o inquilino nao existe no tenant', async () => {
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(administracaoAtiva);
      const imovelFindFirst = jest.fn().mockResolvedValue(imovelParaLocacao);
      const pessoaFindFirst = jest.fn().mockResolvedValue(null);
      const contratoDeLocacaoCreate = jest.fn();
      const { service } = criarServicoComTx({
        contratoDeAdministracaoFindFirst,
        imovelFindFirst,
        pessoaFindFirst,
        contratoDeLocacaoCreate,
      });

      await expect(service.criar(tenantId, 'usr1', inputBase)).rejects.toBeInstanceOf(BadRequestException);
      expect(contratoDeLocacaoCreate).not.toHaveBeenCalled();
    });
  });

  describe('listar (escopado por unidade via contrato de administracao)', () => {
    it('filtra pela unidade do chamador atraves da relacao com contratoDeAdministracao', async () => {
      const contratoDeLocacaoFindMany = jest.fn().mockResolvedValue([contratoLocacaoRecord]);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindMany });

      const resultado = await service.listar(tenantId, 'un-A');

      expect(contratoDeLocacaoFindMany).toHaveBeenCalledWith({
        where: { tenantId, contratoDeAdministracao: { unidadeId: 'un-A' } },
        orderBy: { criadoEm: 'desc' },
      });
      expect(resultado).toHaveLength(1);
    });
  });
});
