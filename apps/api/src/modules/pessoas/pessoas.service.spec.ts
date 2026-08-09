import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PessoasService } from './pessoas.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre criar/listar (sem história numerada) e ART-012 (LGPD): correção e eliminação.
describe('PessoasService', () => {
  const tenantId = 'tenant-1';

  function criarServicoComTx(tx: {
    pessoaCreate?: jest.Mock;
    pessoaFindMany?: jest.Mock;
    pessoaFindFirst?: jest.Mock;
    pessoaUpdate?: jest.Mock;
    contratoDeAdministracaoFindFirst?: jest.Mock;
    contratoDeLocacaoFindFirst?: jest.Mock;
    garantiaFindFirst?: jest.Mock;
    imovelCoproprietarioFindFirst?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          pessoa: {
            create: tx.pessoaCreate,
            findMany: tx.pessoaFindMany,
            findFirst: tx.pessoaFindFirst,
            update: tx.pessoaUpdate,
          },
          contratoDeAdministracao: { findFirst: tx.contratoDeAdministracaoFindFirst ?? jest.fn().mockResolvedValue(null) },
          contratoDeLocacao: { findFirst: tx.contratoDeLocacaoFindFirst ?? jest.fn().mockResolvedValue(null) },
          garantia: { findFirst: tx.garantiaFindFirst ?? jest.fn().mockResolvedValue(null) },
          imovelCoproprietario: { findFirst: tx.imovelCoproprietarioFindFirst ?? jest.fn().mockResolvedValue(null) },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);

    return new PessoasService(tenantPrisma, auditoriaService);
  }

  const pessoaBase = {
    id: 'p1',
    tenantId,
    tipo: 'FISICA',
    nome: 'Fulano de Tal',
    documentoNormalizado: '12345678900',
    telefoneNormalizado: '11999990000',
    anonimizadoEm: null,
    criadoEm: new Date('2026-08-01T00:00:00.000Z'),
  };

  describe('criar', () => {
    it('cria a pessoa com telefone (campo antes aceito no banco mas nunca no endpoint)', async () => {
      const pessoaCreate = jest.fn().mockResolvedValue(pessoaBase);
      const service = criarServicoComTx({ pessoaCreate });

      const resultado = await service.criar(tenantId, {
        tipo: 'FISICA',
        nome: 'Fulano de Tal',
        documentoNormalizado: '12345678900',
        telefoneNormalizado: '11999990000',
      });

      expect(pessoaCreate).toHaveBeenCalledWith({
        data: { tenantId, tipo: 'FISICA', nome: 'Fulano de Tal', documentoNormalizado: '12345678900', telefoneNormalizado: '11999990000' },
      });
      expect(resultado.telefoneNormalizado).toBe('11999990000');
    });

    it('traduz conflito de documento/telefone duplicado (P2002) em 400 com mensagem clara', async () => {
      const erro = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['tenant_id', 'documento_normalizado'] },
      });
      const pessoaCreate = jest.fn().mockRejectedValue(erro);
      const service = criarServicoComTx({ pessoaCreate });

      await expect(
        service.criar(tenantId, { tipo: 'FISICA', nome: 'Fulano', documentoNormalizado: '12345678900' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('atualizar (ART-012, direito de correção)', () => {
    it('atualiza os dados e audita', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(pessoaBase);
      const pessoaUpdate = jest.fn().mockResolvedValue({ ...pessoaBase, nome: 'Fulano Corrigido' });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ pessoaFindFirst, pessoaUpdate, registroDeAuditoriaCreate });

      const resultado = await service.atualizar(tenantId, 'usr1', 'p1', { nome: 'Fulano Corrigido' });

      expect(pessoaUpdate).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { nome: 'Fulano Corrigido', documentoNormalizado: undefined, telefoneNormalizado: undefined },
      });
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: { tenantId, atorUsuarioId: 'usr1', acao: 'PESSOA_DADOS_CORRIGIDOS', entidadeTipo: 'Pessoa', entidadeId: 'p1', motivo: undefined },
      });
      expect(resultado.nome).toBe('Fulano Corrigido');
    });

    it('rejeita quando a pessoa nao existe no tenant', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ pessoaFindFirst });

      await expect(service.atualizar(tenantId, 'usr1', 'p-outro-tenant', { nome: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejeita editar um titular ja anonimizado', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue({ ...pessoaBase, anonimizadoEm: new Date() });
      const pessoaUpdate = jest.fn();
      const service = criarServicoComTx({ pessoaFindFirst, pessoaUpdate });

      await expect(service.atualizar(tenantId, 'usr1', 'p1', { nome: 'X' })).rejects.toBeInstanceOf(BadRequestException);
      expect(pessoaUpdate).not.toHaveBeenCalled();
    });

    it('traduz conflito de telefone duplicado (P2002) em 400', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(pessoaBase);
      const erro = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['tenant_id', 'telefone_normalizado'] },
      });
      const pessoaUpdate = jest.fn().mockRejectedValue(erro);
      const service = criarServicoComTx({ pessoaFindFirst, pessoaUpdate });

      await expect(
        service.atualizar(tenantId, 'usr1', 'p1', { telefoneNormalizado: '11888880000' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('solicitarEliminacao (ART-012, direito de eliminação)', () => {
    it('anonimiza e audita quando nao ha nenhuma obrigacao ativa', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(pessoaBase);
      const pessoaUpdate = jest.fn().mockResolvedValue({
        ...pessoaBase,
        nome: 'Titular anonimizado (LGPD)',
        documentoNormalizado: null,
        telefoneNormalizado: null,
        anonimizadoEm: new Date(),
      });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ pessoaFindFirst, pessoaUpdate, registroDeAuditoriaCreate });

      const resultado = await service.solicitarEliminacao(tenantId, 'usr1', 'p1', 'pedido do titular via e-mail');

      expect(pessoaUpdate).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { nome: 'Titular anonimizado (LGPD)', documentoNormalizado: null, telefoneNormalizado: null, anonimizadoEm: expect.any(Date) },
      });
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId: 'usr1',
          acao: 'PESSOA_ANONIMIZADA',
          entidadeTipo: 'Pessoa',
          entidadeId: 'p1',
          motivo: 'pedido do titular via e-mail',
        },
      });
      expect(resultado.documentoNormalizado).toBeNull();
      expect(resultado.anonimizadoEm).not.toBeNull();
    });

    it('e idempotente: chamar de novo num titular ja anonimizado so devolve o estado atual, sem re-auditar', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue({ ...pessoaBase, anonimizadoEm: new Date('2026-08-01T00:00:00.000Z') });
      const pessoaUpdate = jest.fn();
      const registroDeAuditoriaCreate = jest.fn();
      const service = criarServicoComTx({ pessoaFindFirst, pessoaUpdate, registroDeAuditoriaCreate });

      const resultado = await service.solicitarEliminacao(tenantId, 'usr1', 'p1', 'novo pedido');

      expect(pessoaUpdate).not.toHaveBeenCalled();
      expect(registroDeAuditoriaCreate).not.toHaveBeenCalled();
      expect(resultado.anonimizadoEm).not.toBeNull();
    });

    it('rejeita quando a pessoa nao existe no tenant', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ pessoaFindFirst });

      await expect(service.solicitarEliminacao(tenantId, 'usr1', 'p-outro-tenant', 'motivo')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('DEC-NEG-018: bloqueia quando ha contrato de administracao ATIVO como proprietario', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(pessoaBase);
      const contratoDeAdministracaoFindFirst = jest.fn().mockResolvedValue({ id: 'ca1' });
      const pessoaUpdate = jest.fn();
      const service = criarServicoComTx({ pessoaFindFirst, contratoDeAdministracaoFindFirst, pessoaUpdate });

      await expect(service.solicitarEliminacao(tenantId, 'usr1', 'p1', 'motivo')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(pessoaUpdate).not.toHaveBeenCalled();
    });

    it('DEC-NEG-018: bloqueia quando ha contrato de locacao nao encerrado como inquilino', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(pessoaBase);
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue({ id: 'cl1' });
      const pessoaUpdate = jest.fn();
      const service = criarServicoComTx({ pessoaFindFirst, contratoDeLocacaoFindFirst, pessoaUpdate });

      await expect(service.solicitarEliminacao(tenantId, 'usr1', 'p1', 'motivo')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(pessoaUpdate).not.toHaveBeenCalled();
      expect(contratoDeLocacaoFindFirst).toHaveBeenCalledWith({
        where: { tenantId, inquilinoPessoaId: 'p1', estado: { not: 'ENCERRADO' } },
      });
    });

    it('DEC-NEG-018: bloqueia quando ha garantia de fiador em contrato nao encerrado', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(pessoaBase);
      const garantiaFindFirst = jest.fn().mockResolvedValue({ id: 'g1' });
      const pessoaUpdate = jest.fn();
      const service = criarServicoComTx({ pessoaFindFirst, garantiaFindFirst, pessoaUpdate });

      await expect(service.solicitarEliminacao(tenantId, 'usr1', 'p1', 'motivo')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(pessoaUpdate).not.toHaveBeenCalled();
    });

    it('DEC-NEG-018: bloqueia quando ha coproprietariedade vigente', async () => {
      const pessoaFindFirst = jest.fn().mockResolvedValue(pessoaBase);
      const imovelCoproprietarioFindFirst = jest.fn().mockResolvedValue({ id: 'ic1' });
      const pessoaUpdate = jest.fn();
      const service = criarServicoComTx({ pessoaFindFirst, imovelCoproprietarioFindFirst, pessoaUpdate });

      await expect(service.solicitarEliminacao(tenantId, 'usr1', 'p1', 'motivo')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(pessoaUpdate).not.toHaveBeenCalled();
    });
  });
});
