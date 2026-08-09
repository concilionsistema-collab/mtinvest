import { NotFoundException } from '@nestjs/common';
import { DocumentosService } from './documentos.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Cobre US-112 (ART-015-backlog-fase-2.md) / RN-411 (ART-010).
describe('DocumentosService', () => {
  const tenantId = 'tenant-1';
  const unidadeId = 'un-A';

  function criarServicoComTx(tx: {
    contratoDeLocacaoFindFirst?: jest.Mock;
    documentoDeContratoCreate?: jest.Mock;
    documentoDeContratoFindMany?: jest.Mock;
    registroDeAuditoriaCreate?: jest.Mock;
  }) {
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({
          contratoDeLocacao: { findFirst: tx.contratoDeLocacaoFindFirst },
          documentoDeContrato: { create: tx.documentoDeContratoCreate, findMany: tx.documentoDeContratoFindMany },
          registroDeAuditoria: { create: tx.registroDeAuditoriaCreate ?? jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as TenantPrismaService;

    const auditoriaService = new AuditoriaService(tenantPrisma);
    return { service: new DocumentosService(tenantPrisma, auditoriaService) };
  }

  const contrato = { id: 'cl1', tenantId };
  const documentoCriado = {
    id: 'doc1',
    tenantId,
    contratoDeLocacaoId: 'cl1',
    tipo: 'CONTRATO_ASSINADO',
    descricao: 'Contrato assinado pelas partes',
    referencia: 'https://exemplo.com/contrato.pdf',
    anexadoPorUsuarioId: 'usr1',
    criadoEm: new Date('2026-08-06T00:00:00.000Z'),
  };

  describe('anexar', () => {
    it('anexa um documento ao contrato e audita', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contrato);
      const documentoDeContratoCreate = jest.fn().mockResolvedValue(documentoCriado);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, documentoDeContratoCreate });

      const resultado = await service.anexar(tenantId, 'usr1', unidadeId, 'cl1', {
        tipo: 'CONTRATO_ASSINADO',
        descricao: 'Contrato assinado pelas partes',
        referencia: 'https://exemplo.com/contrato.pdf',
      });

      expect(documentoDeContratoCreate).toHaveBeenCalledWith({
        data: {
          tenantId,
          contratoDeLocacaoId: 'cl1',
          tipo: 'CONTRATO_ASSINADO',
          descricao: 'Contrato assinado pelas partes',
          referencia: 'https://exemplo.com/contrato.pdf',
          anexadoPorUsuarioId: 'usr1',
        },
      });
      expect(resultado.id).toBe('doc1');
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(
        service.anexar(tenantId, 'usr1', unidadeId, 'cl-outro-tenant', {
          tipo: 'OUTRO',
          descricao: 'x',
          referencia: 'y',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listar', () => {
    it('lista os documentos do contrato', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(contrato);
      const documentoDeContratoFindMany = jest.fn().mockResolvedValue([documentoCriado]);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst, documentoDeContratoFindMany });

      const resultado = await service.listar(tenantId, unidadeId, 'cl1');

      expect(documentoDeContratoFindMany).toHaveBeenCalledWith({
        where: { tenantId, contratoDeLocacaoId: 'cl1' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(resultado).toHaveLength(1);
    });

    it('rejeita quando o contrato nao existe no tenant', async () => {
      const contratoDeLocacaoFindFirst = jest.fn().mockResolvedValue(null);
      const { service } = criarServicoComTx({ contratoDeLocacaoFindFirst });

      await expect(service.listar(tenantId, unidadeId, 'cl-outro-tenant')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
