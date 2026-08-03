import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RadarService } from './radar.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

function decimal(valor: number | null) {
  if (valor === null) return null;
  return { toNumber: () => valor };
}

// Cobre US-022 (ART-014) / RN-316 (ART-009).
describe('RadarService', () => {
  const tenantId = 'tenant-1';

  interface TxMocks {
    leadFindFirst?: jest.Mock;
    imovelFindMany?: jest.Mock;
    imovelFindFirst?: jest.Mock;
    oportunidadeFindMany?: jest.Mock;
    sugestaoFindMany?: jest.Mock;
    sugestaoUpsert?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }

  function criarServicoComTx(tx: TxMocks) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          lead: { findFirst: tx.leadFindFirst },
          imovel: { findMany: tx.imovelFindMany, findFirst: tx.imovelFindFirst },
          oportunidade: { findMany: tx.oportunidadeFindMany },
          sugestaoRadar: { findMany: tx.sugestaoFindMany, upsert: tx.sugestaoUpsert },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    return new RadarService(tenantPrisma, new AuditoriaService(tenantPrisma));
  }

  describe('sugerir', () => {
    it('CA-001: retorna imoveis compativeis, sem criar oportunidade nenhuma', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({
        id: 'lead1',
        tenantId,
        unidadeId: 'un-A',
        responsavelUsuarioId: 'usr1',
        finalidadeDesejada: 'VENDA',
        orcamentoMinimo: decimal(200000),
        orcamentoMaximo: decimal(500000),
      });
      const imovelFindMany = jest.fn().mockResolvedValue([
        {
          id: 'imv1',
          tenantId,
          unidadeProprietariaId: 'un-A',
          finalidade: 'VENDA',
          enderecoResumo: 'Rua A',
          valorAnunciado: decimal(300000),
          percentualDescontoPreAutorizado: null,
          estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE',
          escopoCompartilhamento: null,
          criadoEm: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 'imv2-fora-orcamento',
          tenantId,
          unidadeProprietariaId: 'un-A',
          finalidade: 'VENDA',
          enderecoResumo: 'Rua B',
          valorAnunciado: decimal(900000),
          percentualDescontoPreAutorizado: null,
          estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE',
          escopoCompartilhamento: null,
          criadoEm: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 'imv3-finalidade-incompativel',
          tenantId,
          unidadeProprietariaId: 'un-A',
          finalidade: 'LOCACAO',
          enderecoResumo: 'Rua C',
          valorAnunciado: decimal(300000),
          percentualDescontoPreAutorizado: null,
          estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE',
          escopoCompartilhamento: null,
          criadoEm: new Date('2026-08-01T00:00:00.000Z'),
        },
      ]);
      const oportunidadeFindMany = jest.fn().mockResolvedValue([]);
      const sugestaoFindMany = jest.fn().mockResolvedValue([]);
      const service = criarServicoComTx({
        leadFindFirst,
        imovelFindMany,
        oportunidadeFindMany,
        sugestaoFindMany,
      });

      const resultado = await service.sugerir(tenantId, 'lead1', 'usr1');

      expect(resultado).toHaveLength(1);
      expect(resultado[0].imovel.id).toBe('imv1');
      expect(resultado[0].decisao).toBeNull();
    });

    it('exclui imovel que ja tem oportunidade ativa com este lead', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({
        id: 'lead1',
        tenantId,
        unidadeId: 'un-A',
        responsavelUsuarioId: 'usr1',
        finalidadeDesejada: null,
        orcamentoMinimo: null,
        orcamentoMaximo: null,
      });
      const imovelFindMany = jest.fn().mockResolvedValue([
        {
          id: 'imv-ja-em-negociacao',
          tenantId,
          unidadeProprietariaId: 'un-A',
          finalidade: 'VENDA',
          enderecoResumo: 'Rua A',
          valorAnunciado: null,
          percentualDescontoPreAutorizado: null,
          estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE',
          escopoCompartilhamento: null,
          criadoEm: new Date('2026-08-01T00:00:00.000Z'),
        },
      ]);
      const oportunidadeFindMany = jest.fn().mockResolvedValue([{ imovelId: 'imv-ja-em-negociacao' }]);
      const sugestaoFindMany = jest.fn().mockResolvedValue([]);
      const service = criarServicoComTx({
        leadFindFirst,
        imovelFindMany,
        oportunidadeFindMany,
        sugestaoFindMany,
      });

      const resultado = await service.sugerir(tenantId, 'lead1', 'usr1');
      expect(resultado).toHaveLength(0);
    });

    it('bloqueia consulta por quem nao e o responsavel pelo lead', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const service = criarServicoComTx({ leadFindFirst });

      await expect(service.sugerir(tenantId, 'lead1', 'outro-usuario')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanca 404 quando o lead nao existe neste tenant', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue(null);
      const service = criarServicoComTx({ leadFindFirst });

      await expect(service.sugerir(tenantId, 'lead-inexistente', 'usr1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('decidir', () => {
    it('registra a decisao (auditoria) sem criar oportunidade', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const imovelFindFirst = jest.fn().mockResolvedValue({ id: 'imv1', tenantId });
      const sugestaoUpsert = jest.fn().mockResolvedValue({
        id: 'sug1',
        tenantId,
        leadId: 'lead1',
        imovelId: 'imv1',
        status: 'ACEITA',
        usuarioId: 'usr1',
        criadoEm: new Date('2026-08-01T00:00:00.000Z'),
      });
      const registroDeAuditoriaCreate = jest.fn().mockResolvedValue({});
      const service = criarServicoComTx({ leadFindFirst, imovelFindFirst, sugestaoUpsert, registroDeAuditoriaCreate });

      const resultado = await service.decidir(tenantId, 'lead1', 'imv1', 'usr1', 'ACEITA');

      expect(resultado.status).toBe('ACEITA');
      expect(sugestaoUpsert).toHaveBeenCalledWith({
        where: { tenantId_leadId_imovelId: { tenantId, leadId: 'lead1', imovelId: 'imv1' } },
        create: { tenantId, leadId: 'lead1', imovelId: 'imv1', usuarioId: 'usr1', status: 'ACEITA' },
        update: { usuarioId: 'usr1', status: 'ACEITA' },
      });
      expect(registroDeAuditoriaCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          atorUsuarioId: 'usr1',
          acao: 'SUGESTAO_RADAR_DECIDIDA',
          entidadeTipo: 'SugestaoRadar',
          entidadeId: 'sug1',
          motivo: 'ACEITA',
        },
      });
    });

    it('bloqueia decisao por quem nao e o responsavel pelo lead', async () => {
      const leadFindFirst = jest.fn().mockResolvedValue({ id: 'lead1', tenantId, responsavelUsuarioId: 'usr1' });
      const sugestaoUpsert = jest.fn();
      const service = criarServicoComTx({ leadFindFirst, sugestaoUpsert });

      await expect(service.decidir(tenantId, 'lead1', 'imv1', 'outro-usuario', 'ACEITA')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(sugestaoUpsert).not.toHaveBeenCalled();
    });
  });
});
