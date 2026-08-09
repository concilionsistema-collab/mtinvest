import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PortalService } from './portal.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

function decimal(valor: number) {
  return new Prisma.Decimal(valor);
}

// Cobre US-113 (ART-015-backlog-fase-2.md) / RN-413 (ART-010).
describe('PortalService', () => {
  const tenantId = 'tenant-1';
  const gestor: UsuarioAutenticado = { id: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'usr2', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR' };

  function criarServico(opts: {
    acessoPortalContratoFindFirstGlobal?: jest.Mock;
    tx: {
      contratoDeLocacaoFindFirst?: jest.Mock;
      contratoDeAdministracaoFindFirst?: jest.Mock;
      imovelFindFirst?: jest.Mock;
      acessoPortalContratoCreate?: jest.Mock;
      acessoPortalContratoFindFirst?: jest.Mock;
      acessoPortalContratoUpdate?: jest.Mock;
      acessoPortalContratoFindMany?: jest.Mock;
      documentoDeContratoFindMany?: jest.Mock;
      vistoriaFindMany?: jest.Mock;
      reajusteFindMany?: jest.Mock;
      renovacaoFindMany?: jest.Mock;
      registroDeAuditoriaCreate?: jest.Mock;
    };
  }) {
    const prisma = {
      acessoPortalContrato: { findFirst: opts.acessoPortalContratoFindFirstGlobal },
    } as unknown as PrismaService;

    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          contratoDeLocacao: { findFirst: opts.tx.contratoDeLocacaoFindFirst },
          contratoDeAdministracao: { findFirst: opts.tx.contratoDeAdministracaoFindFirst },
          imovel: { findFirst: opts.tx.imovelFindFirst },
          acessoPortalContrato: {
            create: opts.tx.acessoPortalContratoCreate,
            findFirst: opts.tx.acessoPortalContratoFindFirst,
            update: opts.tx.acessoPortalContratoUpdate,
            findMany: opts.tx.acessoPortalContratoFindMany,
          },
          documentoDeContrato: { findMany: opts.tx.documentoDeContratoFindMany },
          vistoria: { findMany: opts.tx.vistoriaFindMany },
          reajuste: { findMany: opts.tx.reajusteFindMany },
          renovacao: { findMany: opts.tx.renovacaoFindMany },
          registroDeAuditoria: { create: opts.tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);
    return { service: new PortalService(prisma, tenantPrisma, auditoriaService) };
  }

  const contrato = { id: 'cl1', tenantId, contratoDeAdministracaoId: 'ca1', inquilinoPessoaId: 'pe-inquilino' };
  const administracao = { id: 'ca1', tenantId, imovelId: 'im1', proprietarioPessoaId: 'pe-proprietario' };

  describe('gerarAcesso', () => {
    it('CORRETOR nao pode gerar acesso (so GESTOR_UNIDADE)', async () => {
      const { service } = criarServico({ tx: {} });

      await expect(service.gerarAcesso(tenantId, corretor, 'cl1', { pessoaId: 'pe-inquilino' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('gera acesso para o inquilino e retorna o token em texto puro', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contrato);
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(administracao);
      const acessoPortalContratoCreate = jest.fn().mockResolvedValue({
        id: 'ac1',
        tenantId,
        contratoDeLocacaoId: 'cl1',
        pessoaId: 'pe-inquilino',
        tokenHash: 'hash-simulado',
        criadoPorUsuarioId: gestor.id,
        revogadoEm: null,
        criadoEm: new Date('2026-08-06T00:00:00.000Z'),
      });
      const { service } = criarServico({
        tx: { contratoDeLocacaoFindFirst, contratoDeAdministracaoFindFirst, acessoPortalContratoCreate },
      });

      const resultado = await service.gerarAcesso(tenantId, gestor, 'cl1', { pessoaId: 'pe-inquilino' });

      expect(resultado.token).toEqual(expect.any(String));
      expect(resultado.token.length).toBeGreaterThan(20);
      expect(resultado.pessoaId).toBe('pe-inquilino');
      const dadosGravados = acessoPortalContratoCreate.mock.calls[0][0].data;
      expect(dadosGravados.tokenHash).not.toBe(resultado.token);
    });

    it('gera acesso para o proprietario', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contrato);
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(administracao);
      const acessoPortalContratoCreate = jest.fn().mockResolvedValue({
        id: 'ac2',
        tenantId,
        contratoDeLocacaoId: 'cl1',
        pessoaId: 'pe-proprietario',
        tokenHash: 'hash-simulado-2',
        criadoPorUsuarioId: gestor.id,
        revogadoEm: null,
        criadoEm: new Date('2026-08-06T00:00:00.000Z'),
      });
      const { service } = criarServico({
        tx: { contratoDeLocacaoFindFirst, contratoDeAdministracaoFindFirst, acessoPortalContratoCreate },
      });

      const resultado = await service.gerarAcesso(tenantId, gestor, 'cl1', { pessoaId: 'pe-proprietario' });

      expect(resultado.pessoaId).toBe('pe-proprietario');
    });

    it('RN-413: rejeita pessoa que nao e proprietario nem inquilino deste contrato', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contrato);
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(administracao);
      const acessoPortalContratoCreate = jest.fn();
      const { service } = criarServico({
        tx: { contratoDeLocacaoFindFirst, contratoDeAdministracaoFindFirst, acessoPortalContratoCreate },
      });

      await expect(
        service.gerarAcesso(tenantId, gestor, 'cl1', { pessoaId: 'pe-estranha' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(acessoPortalContratoCreate).not.toHaveBeenCalled();
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServico({ tx: { contratoDeLocacaoFindFirst } });

      await expect(
        service.gerarAcesso(tenantId, gestor, 'cl-outro-tenant', { pessoaId: 'pe-inquilino' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('CORREÇÃO DE SEGURANÇA: rejeita gerar acesso de portal pra um contrato de OUTRA unidade', async () => {
      const gestorDeOutraUnidade = { ...gestor, unidadeId: 'un-DE-OUTRA-UNIDADE' };
      const contratoDeLocacaoFindFirst = jest.fn((args) =>
        args.where.contratoDeAdministracao?.unidadeId === gestor.unidadeId ? Promise.resolve(contrato) : Promise.resolve(null),
      );
      const { service } = criarServico({ tx: { contratoDeLocacaoFindFirst } });

      await expect(
        service.gerarAcesso(tenantId, gestorDeOutraUnidade, 'cl1', { pessoaId: 'pe-inquilino' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('revogarAcesso', () => {
    it('CORRETOR nao pode revogar acesso', async () => {
      const { service } = criarServico({ tx: {} });

      await expect(service.revogarAcesso(tenantId, corretor, 'ac1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('revoga um acesso ativo', async () => {
      const acessoAtivo = { id: 'ac1', tenantId, contratoDeLocacaoId: 'cl1', pessoaId: 'pe-inquilino', criadoPorUsuarioId: gestor.id, criadoEm: new Date('2026-08-06T00:00:00.000Z'), revogadoEm: null };
      const acessoPortalContratoFindFirst = jest.fn().mockResolvedValue(acessoAtivo);
      const acessoPortalContratoUpdate = jest.fn().mockResolvedValue({ ...acessoAtivo, revogadoEm: new Date('2026-08-06T00:00:00.000Z') });
      const { service } = criarServico({ tx: { acessoPortalContratoFindFirst, acessoPortalContratoUpdate } });

      const resultado = await service.revogarAcesso(tenantId, gestor, 'ac1');

      expect(acessoPortalContratoUpdate).toHaveBeenCalledWith({ where: { id: 'ac1' }, data: { revogadoEm: expect.any(Date) } });
      expect(resultado.revogadoEm).not.toBeNull();
    });

    it('e idempotente - revogar um acesso ja revogado nao lanca erro nem re-audita', async () => {
      const acessoJaRevogado = { id: 'ac1', tenantId, contratoDeLocacaoId: 'cl1', pessoaId: 'pe-inquilino', criadoPorUsuarioId: gestor.id, criadoEm: new Date('2026-08-06T00:00:00.000Z'), revogadoEm: new Date('2020-01-01') };
      const acessoPortalContratoFindFirst = jest.fn().mockResolvedValue(acessoJaRevogado);
      const acessoPortalContratoUpdate = jest.fn();
      const registroDeAuditoriaCreate = jest.fn();
      const { service } = criarServico({
        tx: { acessoPortalContratoFindFirst, acessoPortalContratoUpdate, registroDeAuditoriaCreate },
      });

      await service.revogarAcesso(tenantId, gestor, 'ac1');

      expect(acessoPortalContratoUpdate).not.toHaveBeenCalled();
      expect(registroDeAuditoriaCreate).not.toHaveBeenCalled();
    });
  });

  describe('consultar (rota publica, sem JWT)', () => {
    it('resolve o tenant a partir do token e retorna o resumo somente-leitura', async () => {
      const acessoPortalContratoFindFirstGlobal = jest.fn().mockResolvedValue({
        id: 'ac1',
        tenantId,
        contratoDeLocacaoId: 'cl1',
        pessoaId: 'pe-inquilino',
        revogadoEm: null,
      });
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({
        id: 'cl1',
        tenantId,
        contratoDeAdministracaoId: 'ca1',
        estado: 'VIGENTE',
        valorAluguel: decimal(2500),
        diaVencimento: 10,
        indiceReajuste: 'IGPM',
        vencimentoAtual: new Date('2027-08-01T00:00:00.000Z'),
      });
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue(administracao);
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'im1', enderecoResumo: 'Rua Teste, 123' });
      const documentoDeContratoFindMany = jest.fn().mockResolvedValue([]);
      const vistoriaFindMany = jest.fn().mockResolvedValue([]);
      const reajusteFindMany = jest.fn().mockResolvedValue([]);
      const renovacaoFindMany = jest.fn().mockResolvedValue([]);
      const { service } = criarServico({
        acessoPortalContratoFindFirstGlobal,
        tx: {
          contratoDeLocacaoFindFirst,
          contratoDeAdministracaoFindFirst,
          imovelFindFirst,
          documentoDeContratoFindMany,
          vistoriaFindMany,
          reajusteFindMany,
          renovacaoFindMany,
        },
      });

      const resultado = await service.consultar('token-em-texto-puro');

      expect(acessoPortalContratoFindFirstGlobal).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revogadoEm: null },
      });
      expect(resultado.contratoDeLocacaoId).toBe('cl1');
      expect(resultado.enderecoImovel).toBe('Rua Teste, 123');
      expect(resultado.estado).toBe('VIGENTE');
      expect(resultado.valorAluguel).toBe(2500);
    });

    it('rejeita token inexistente ou revogado com erro generico (nunca vaza qual dos dois)', async () => {
      const acessoPortalContratoFindFirstGlobal = jest.fn().mockResolvedValue(null);
      const { service } = criarServico({ acessoPortalContratoFindFirstGlobal, tx: {} });

      await expect(service.consultar('token-invalido')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
