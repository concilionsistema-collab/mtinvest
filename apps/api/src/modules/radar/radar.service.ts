import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Imovel as ImovelRecord, SugestaoRadar as SugestaoRadarRecord } from '@prisma/client';
import { Imovel, SugestaoImovel, SugestaoRadar, SugestaoRadarStatus } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

function paraSugestaoRadar(registro: SugestaoRadarRecord): SugestaoRadar {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    leadId: registro.leadId,
    imovelId: registro.imovelId,
    status: registro.status,
    usuarioId: registro.usuarioId,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

function paraImovel(registro: ImovelRecord): Imovel {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    unidadeProprietariaId: registro.unidadeProprietariaId,
    finalidade: registro.finalidade,
    enderecoResumo: registro.enderecoResumo,
    valorAnunciado: registro.valorAnunciado ? registro.valorAnunciado.toNumber() : null,
    percentualDescontoPreAutorizado: registro.percentualDescontoPreAutorizado
      ? registro.percentualDescontoPreAutorizado.toNumber()
      : null,
    estadoCompartilhamento: registro.estadoCompartilhamento,
    escopoCompartilhamento: registro.escopoCompartilhamento,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class RadarService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // US-022 (ART-014) / RN-316 (ART-009): sugere imoveis compativeis com o
  // lead, SEM criar oportunidade - a lista e sempre computada sob demanda,
  // nunca persistida como "sugestao pendente". So vira registro (SugestaoRadar)
  // quando o corretor decide (ver decidir()).
  //
  // CRITERIO DE COMPATIBILIDADE - EXTENSAO REGISTRADA (RN-316 nao define o
  // algoritmo, e ART-005 nuclear nao tem campos de preferencia em Lead):
  //  - visivel para a unidade do lead: imovel proprio da unidade OU
  //    compartilhado com a rede (REGIAO/LISTA nao tem dado estruturado para
  //    filtrar de verdade neste MVP - qualquer COMPARTILHADO conta).
  //  - finalidade compativel (se o lead nao informou preferencia, nao filtra).
  //  - dentro do orcamento (so filtra quando AMBOS os lados tem o dado -
  //    lead com faixa informada E imovel com valorAnunciado informado).
  //  - exclui imoveis que ja tem oportunidade ativa (nao perdida) com este lead.
  async sugerir(tenantId: string, leadId: string, usuarioId: string): Promise<SugestaoImovel[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId } });
      if (!lead) {
        throw new NotFoundException('Lead não encontrado neste tenant.');
      }
      if (lead.responsavelUsuarioId !== usuarioId) {
        throw new BadRequestException('Apenas o responsável pelo lead pode consultar as sugestões do radar.');
      }

      const candidatos = await tx.imovel.findMany({
        where: {
          tenantId,
          estadoCompartilhamento: { not: 'ENCERRADO' },
          OR: [{ unidadeProprietariaId: lead.unidadeId }, { estadoCompartilhamento: 'COMPARTILHADO' }],
        },
      });

      const oportunidadesAtivas = await tx.oportunidade.findMany({
        where: { tenantId, leadId, estado: { not: 'PERDIDA' } },
        select: { imovelId: true },
      });
      const imoveisJaEmNegociacao = new Set(oportunidadesAtivas.map((o) => o.imovelId));

      const orcamentoMinimo = lead.orcamentoMinimo?.toNumber() ?? null;
      const orcamentoMaximo = lead.orcamentoMaximo?.toNumber() ?? null;

      const compativeis = candidatos.filter((imovel) => {
        if (imoveisJaEmNegociacao.has(imovel.id)) {
          return false;
        }
        if (lead.finalidadeDesejada && lead.finalidadeDesejada !== 'AMBOS') {
          if (imovel.finalidade !== 'AMBOS' && imovel.finalidade !== lead.finalidadeDesejada) {
            return false;
          }
        }
        const valorAnunciado = imovel.valorAnunciado?.toNumber() ?? null;
        if (valorAnunciado !== null) {
          if (orcamentoMinimo !== null && valorAnunciado < orcamentoMinimo) return false;
          if (orcamentoMaximo !== null && valorAnunciado > orcamentoMaximo) return false;
        }
        return true;
      });

      const decisoes = await tx.sugestaoRadar.findMany({ where: { tenantId, leadId } });
      const decisaoPorImovel = new Map(decisoes.map((d) => [d.imovelId, d.status]));

      return compativeis.map((imovel) => ({
        imovel: paraImovel(imovel),
        decisao: decisaoPorImovel.get(imovel.id) ?? null,
      }));
    });
  }

  // US-022 / Auditoria: cada decisao (aceita/recusada) fica registrada.
  // NUNCA cria Oportunidade aqui - RN-316 exige acao humana explicita e
  // separada (POST /oportunidades) para isso.
  async decidir(
    tenantId: string,
    leadId: string,
    imovelId: string,
    usuarioId: string,
    status: SugestaoRadarStatus,
  ): Promise<SugestaoRadar> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId } });
      if (!lead) {
        throw new NotFoundException('Lead não encontrado neste tenant.');
      }
      if (lead.responsavelUsuarioId !== usuarioId) {
        throw new BadRequestException('Apenas o responsável pelo lead pode decidir sobre uma sugestão do radar.');
      }
      const imovel = await tx.imovel.findFirst({ where: { id: imovelId, tenantId } });
      if (!imovel) {
        throw new BadRequestException('O imóvel informado não existe ou não pertence a este tenant.');
      }

      const registro = await tx.sugestaoRadar.upsert({
        where: { tenantId_leadId_imovelId: { tenantId, leadId, imovelId } },
        create: { tenantId, leadId, imovelId, usuarioId, status },
        update: { usuarioId, status },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        usuarioId,
        'SUGESTAO_RADAR_DECIDIDA',
        'SugestaoRadar',
        registro.id,
        status,
      );

      return paraSugestaoRadar(registro);
    });
  }
}
