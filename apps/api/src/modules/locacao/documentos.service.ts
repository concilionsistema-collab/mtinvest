import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentoDeContrato as DocumentoDeContratoRecord } from '@prisma/client';
import { AnexarDocumentoInput, DocumentoDeContrato } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Exportada para reaproveitar em PortalService (US-113) sem duplicar mapeamento.
export function paraDocumento(registro: DocumentoDeContratoRecord): DocumentoDeContrato {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    contratoDeLocacaoId: registro.contratoDeLocacaoId,
    tipo: registro.tipo,
    descricao: registro.descricao,
    referencia: registro.referencia,
    anexadoPorUsuarioId: registro.anexadoPorUsuarioId,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-112 (ART-015-backlog-fase-2.md) / RN-411 (ART-010).
// Permissões: ART-010 §13 não restringe "anexar documento" - aberto a
// qualquer usuário autenticado do tenant (mesmo padrão de criar lead/pessoa),
// diferente das ações financeiras/contratuais sensíveis (laudo, contestação,
// reajuste, renovação) que reaproveitam GESTOR_UNIDADE.
// CORREÇÃO DE SEGURANÇA REGISTRADA (revisão de 2026-08-08): escopo por
// unidade adicionado (mesmo padrão de GarantiasService/VistoriasService).
@Injectable()
export class DocumentosService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async anexar(
    tenantId: string,
    atorUsuarioId: string,
    unidadeId: string,
    contratoDeLocacaoId: string,
    input: AnexarDocumentoInput,
  ): Promise<DocumentoDeContrato> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }

      const criado = await tx.documentoDeContrato.create({
        data: {
          tenantId,
          contratoDeLocacaoId,
          tipo: input.tipo,
          descricao: input.descricao,
          referencia: input.referencia,
          anexadoPorUsuarioId: atorUsuarioId,
        },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        atorUsuarioId,
        'DOCUMENTO_CONTRATO_ANEXADO',
        'ContratoDeLocacao',
        contratoDeLocacaoId,
        `tipo=${input.tipo}`,
      );

      return paraDocumento(criado);
    });
  }

  async listar(tenantId: string, unidadeId: string, contratoDeLocacaoId: string): Promise<DocumentoDeContrato[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      const registros = await tx.documentoDeContrato.findMany({
        where: { tenantId, contratoDeLocacaoId },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraDocumento);
    });
  }
}
