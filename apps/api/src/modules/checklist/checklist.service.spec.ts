import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChecklistService } from './checklist.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

// Cobre US-019 (ART-014) / RN-308 (ART-009).
describe('ChecklistService', () => {
  const tenantId = 'tenant-1';
  const gestor: UsuarioAutenticado = { id: 'usr1', tenantId, unidadeId: 'u1', perfil: 'GESTOR_UNIDADE' };
  const corretor: UsuarioAutenticado = { id: 'cor1', tenantId, unidadeId: 'u1', perfil: 'CORRETOR' };

  interface TxMocks {
    checklistFindFirst?: jest.Mock;
    checklistFindMany?: jest.Mock;
    checklistCreateMany?: jest.Mock;
    checklistUpdate?: jest.Mock;
    checklistCount?: jest.Mock;
    oportunidadeFindFirst?: jest.Mock;
    imovelFindFirst?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }

  function criarServicoComTx(tx: TxMocks) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          checklistDocumentoItem: {
            findFirst: tx.checklistFindFirst,
            findMany: tx.checklistFindMany,
            createMany: tx.checklistCreateMany,
            update: tx.checklistUpdate,
            count: tx.checklistCount,
          },
          oportunidade: { findFirst: tx.oportunidadeFindFirst },
          imovel: { findFirst: tx.imovelFindFirst },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    return new ChecklistService(tenantPrisma, new AuditoriaService(tenantPrisma));
  }

  describe('listarPorOportunidade', () => {
    it('gera os itens padrao de VENDA na primeira consulta (RN-308)', async () => {
      const checklistFindFirst = jest.fn().mockResolvedValue(null);
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId, imovelId: 'imv1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'imv1', tenantId, finalidade: 'VENDA' });
      const checklistCreateMany = jest.fn().mockResolvedValue({});
      const checklistFindMany = jest.fn().mockResolvedValue([
        {
          id: 'item1',
          tenantId,
          oportunidadeId: 'op1',
          descricao: 'RG/CPF do comprador',
          obrigatorio: true,
          concluido: false,
          criadoEm: new Date('2026-08-01T00:00:00.000Z'),
        },
      ]);
      const service = criarServicoComTx({
        checklistFindFirst,
        oportunidadeFindFirst,
        imovelFindFirst,
        checklistCreateMany,
        checklistFindMany,
      });

      const resultado = await service.listarPorOportunidade(tenantId, 'op1', 'u1');

      expect(checklistCreateMany).toHaveBeenCalled();
      expect(resultado).toHaveLength(1);
      expect(resultado[0].descricao).toBe('RG/CPF do comprador');
    });

    it('nao regenera itens quando o checklist ja existe', async () => {
      const checklistFindFirst = jest.fn().mockResolvedValue({ id: 'item-existente' });
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId });
      const checklistCreateMany = jest.fn();
      const checklistFindMany = jest.fn().mockResolvedValue([]);
      const service = criarServicoComTx({ checklistFindFirst, oportunidadeFindFirst, checklistCreateMany, checklistFindMany });

      await service.listarPorOportunidade(tenantId, 'op1', 'u1');

      expect(checklistCreateMany).not.toHaveBeenCalled();
    });

    it('lanca 404 quando a oportunidade nao existe nesta unidade/tenant', async () => {
      const checklistFindFirst = jest.fn().mockResolvedValue(null);
      const oportunidadeFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ checklistFindFirst, oportunidadeFindFirst });

      await expect(service.listarPorOportunidade(tenantId, 'op-inexistente', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('concluirItem', () => {
    it('marca o item como concluido quando o ator e Gestor de unidade da mesma unidade', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId });
      const checklistFindFirst = jest.fn().mockResolvedValue({ id: 'item1', tenantId, oportunidadeId: 'op1' });
      const checklistUpdate = jest.fn().mockResolvedValue({
        id: 'item1',
        tenantId,
        oportunidadeId: 'op1',
        descricao: 'RG/CPF do comprador',
        obrigatorio: true,
        concluido: true,
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ oportunidadeFindFirst, checklistFindFirst, checklistUpdate, registroDeAuditoriaCreate });

      const resultado = await service.concluirItem(tenantId, 'op1', 'item1', true, gestor);

      expect(resultado.concluido).toBe(true);
      expect(checklistUpdate).toHaveBeenCalledWith({ where: { id: 'item1' }, data: { concluido: true } });
      // US-019, "cada item marcado é auditado":
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId: 'usr1',
          acao: 'CHECKLIST_ITEM_ALTERADO',
          entidadeTipo: 'ChecklistDocumentoItem',
          entidadeId: 'item1',
          motivo: 'concluido=true',
        },
      });
    });

    // PENDENCIA FECHADA (Permissões, US-019: "Administrativo, Gestor de unidade").
    it('rejeita corretor - so Gestor de unidade marca item de checklist', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId });
      const checklistUpdate = jest.fn();
      const service = criarServicoComTx({ oportunidadeFindFirst, checklistUpdate });

      await expect(service.concluirItem(tenantId, 'op1', 'item1', true, corretor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(checklistUpdate).not.toHaveBeenCalled();
    });

    it('lanca 404 quando a oportunidade nao pertence a unidade do gestor', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ oportunidadeFindFirst });

      await expect(service.concluirItem(tenantId, 'op-de-outra-unidade', 'item1', true, gestor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lanca 404 quando o item nao pertence a esta oportunidade/tenant', async () => {
      const oportunidadeFindFirst = jest.fn().mockResolvedValue({ id: 'op1', tenantId });
      const checklistFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ oportunidadeFindFirst, checklistFindFirst });

      await expect(service.concluirItem(tenantId, 'op1', 'item-de-outro-tenant', true, gestor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('estaCompletoTx (US-019, CA-001)', () => {
    function criarTxDireto(tx: TxMocks) {
      return {
        checklistDocumentoItem: {
          findFirst: tx.checklistFindFirst,
          findMany: tx.checklistFindMany,
          createMany: tx.checklistCreateMany,
          update: tx.checklistUpdate,
          count: tx.checklistCount,
        },
        oportunidade: { findFirst: tx.oportunidadeFindFirst },
        imovel: { findFirst: tx.imovelFindFirst },
      } as unknown as Parameters<ChecklistService['estaCompletoTx']>[0];
    }

    it('retorna false quando ha item obrigatorio pendente', async () => {
      const checklistFindFirst = jest.fn().mockResolvedValue({ id: 'item-existente' });
      const checklistCount = jest.fn().mockResolvedValue(2);
      const service = new ChecklistService(
        {} as unknown as TenantPrismaService,
        new AuditoriaService({} as unknown as TenantPrismaService),
      );

      const completo = await service.estaCompletoTx(criarTxDireto({ checklistFindFirst, checklistCount }), tenantId, 'op1');

      expect(completo).toBe(false);
    });

    it('retorna true quando todos os itens obrigatorios estao concluidos', async () => {
      const checklistFindFirst = jest.fn().mockResolvedValue({ id: 'item-existente' });
      const checklistCount = jest.fn().mockResolvedValue(0);
      const service = new ChecklistService(
        {} as unknown as TenantPrismaService,
        new AuditoriaService({} as unknown as TenantPrismaService),
      );

      const completo = await service.estaCompletoTx(criarTxDireto({ checklistFindFirst, checklistCount }), tenantId, 'op1');

      expect(completo).toBe(true);
    });
  });
});
