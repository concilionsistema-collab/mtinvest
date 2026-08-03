import { BadRequestException } from '@nestjs/common';
import { ContratosAdministracaoService } from './contratos-administracao.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-101 (ART-015-backlog-fase-2.md) / pré-condição de RN-401 (ART-010).
describe('ContratosAdministracaoService', () => {
  const tenantId = 'tenant-1';

  function criarServicoComTx(tx: {
    unidadeFindFirst?: jest.Mock;
    imovelFindFirst?: jest.Mock;
    pessoaFindFirst?: jest.Mock;
    contratoDeAdministracaoFindFirst?: jest.Mock;
    contratoDeAdministracaoCreate?: jest.Mock;
    contratoDeAdministracaoFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          unidade: { findFirst: tx.unidadeFindFirst },
          imovel: { findFirst: tx.imovelFindFirst },
          pessoa: { findFirst: tx.pessoaFindFirst },
          contratoDeAdministracao: {
            findFirst: tx.contratoDeAdministracaoFindFirst,
            create: tx.contratoDeAdministracaoCreate,
            findMany: tx.contratoDeAdministracaoFindMany,
          },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);

    return { service: new ContratosAdministracaoService(tenantPrisma, auditoriaService) };
  }

  const contratoBase = {
    id: 'ca1',
    tenantId,
    unidadeId: 'un-A',
    imovelId: 'im1',
    proprietarioPessoaId: 'pe1',
    status: 'ATIVO',
    criadoEm: new Date('2026-08-02T00:00:00.000Z'),
  };

  describe('criar', () => {
    it('cria o contrato quando unidade/imovel/proprietario existem e nao ha administracao ativa duplicada', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: 'un-A', tenantId });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'im1', tenantId });
      const pessoaFindFirst = jest.fn().mockResolvedValue({ id: 'pe1', tenantId });
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(null);
      const contratoDeAdministracaoCreate = jest.fn().mockResolvedValue(contratoBase);
      const { service } = criarServicoComTx({
        unidadeFindFirst,
        imovelFindFirst,
        pessoaFindFirst,
        contratoDeAdministracaoFindFirst,
        contratoDeAdministracaoCreate,
      });

      const resultado = await service.criar(tenantId, 'usr1', {
        unidadeId: 'un-A',
        imovelId: 'im1',
        proprietarioPessoaId: 'pe1',
      });

      expect(contratoDeAdministracaoCreate).toHaveBeenCalledWith({
        data: { tenantId, unidadeId: 'un-A', imovelId: 'im1', proprietarioPessoaId: 'pe1' },
      });
      expect(resultado.status).toBe('ATIVO');
    });

    it('rejeita quando a unidade nao existe no tenant', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue(null);
      const contratoDeAdministracaoCreate = jest.fn();
      const { service } = criarServicoComTx({ unidadeFindFirst, contratoDeAdministracaoCreate });

      await expect(
        service.criar(tenantId, 'usr1', { unidadeId: 'un-outro-tenant', imovelId: 'im1', proprietarioPessoaId: 'pe1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(contratoDeAdministracaoCreate).not.toHaveBeenCalled();
    });

    it('rejeita quando o imovel nao existe no tenant', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: 'un-A', tenantId });
      const imovelFindFirst = jest.fn().mockResolvedValue(null);
      const contratoDeAdministracaoCreate = jest.fn();
      const { service } = criarServicoComTx({ unidadeFindFirst, imovelFindFirst, contratoDeAdministracaoCreate });

      await expect(
        service.criar(tenantId, 'usr1', { unidadeId: 'un-A', imovelId: 'im-outro-tenant', proprietarioPessoaId: 'pe1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(contratoDeAdministracaoCreate).not.toHaveBeenCalled();
    });

    it('rejeita quando o proprietario nao existe no tenant', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: 'un-A', tenantId });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'im1', tenantId });
      const pessoaFindFirst = jest.fn().mockResolvedValue(null);
      const contratoDeAdministracaoCreate = jest.fn();
      const { service } = criarServicoComTx({ unidadeFindFirst, imovelFindFirst, pessoaFindFirst, contratoDeAdministracaoCreate });

      await expect(
        service.criar(tenantId, 'usr1', { unidadeId: 'un-A', imovelId: 'im1', proprietarioPessoaId: 'pe-outro-tenant' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(contratoDeAdministracaoCreate).not.toHaveBeenCalled();
    });

    it('rejeita quando ja existe um contrato de administracao ATIVO para o mesmo imovel', async () => {
      const unidadeFindFirst = jest.fn().mockResolvedValue({ id: 'un-A', tenantId });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'im1', tenantId });
      const pessoaFindFirst = jest.fn().mockResolvedValue({ id: 'pe1', tenantId });
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(contratoBase);
      const contratoDeAdministracaoCreate = jest.fn();
      const { service } = criarServicoComTx({
        unidadeFindFirst,
        imovelFindFirst,
        pessoaFindFirst,
        contratoDeAdministracaoFindFirst,
        contratoDeAdministracaoCreate,
      });

      await expect(
        service.criar(tenantId, 'usr1', { unidadeId: 'un-A', imovelId: 'im1', proprietarioPessoaId: 'pe1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(contratoDeAdministracaoCreate).not.toHaveBeenCalled();
    });
  });

  describe('listar (escopado por unidade)', () => {
    it('filtra pela unidade do chamador', async () => {
      const contratoDeAdministracaoFindMany = jest.fn().mockResolvedValue([contratoBase]);
      const { service } = criarServicoComTx({ contratoDeAdministracaoFindMany });

      const resultado = await service.listar(tenantId, 'un-A');

      expect(contratoDeAdministracaoFindMany).toHaveBeenCalledWith({
        where: { tenantId, unidadeId: 'un-A' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(resultado).toHaveLength(1);
    });
  });
});
