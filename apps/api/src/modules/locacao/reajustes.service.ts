import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reajuste as ReajusteRecord } from '@prisma/client';
import { AplicarReajusteInput, Reajuste } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Exportada para reaproveitar em PortalService (US-113) sem duplicar mapeamento.
export function paraReajuste(registro: ReajusteRecord): Reajuste {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    contratoDeLocacaoId: registro.contratoDeLocacaoId,
    competencia: registro.competencia,
    indice: registro.indice,
    percentualIndice: registro.percentualIndice.toNumber(),
    percentualAplicado: registro.percentualAplicado.toNumber(),
    valorAluguelAnterior: registro.valorAluguelAnterior.toNumber(),
    valorAluguelNovo: registro.valorAluguelNovo.toNumber(),
    criadoEm: registro.criadoEm.toISOString(),
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// Implementa US-108 (ART-015-backlog-fase-2.md) / RN-406, RN-407 (ART-010).
// DEC-NEG-015 (pendente, "Opção C" - recomendação técnica): valor do índice
// capturado manualmente por competência - integração com fonte oficial é
// decisão técnica separada, fora de escopo aqui.
// CORREÇÃO DE SEGURANÇA REGISTRADA (revisão de 2026-08-08): escopo por
// unidade adicionado (mesmo padrão de GarantiasService/VistoriasService).
@Injectable()
export class ReajustesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // Permissão: EXTENSÃO REGISTRADA - ART-010 §13 não cita "aplicar reajuste"
  // explicitamente (só cita restrição pra "alteração de parametrização
  // financeira" em geral: índice, garantia, beneficiário de encargos).
  // Reaproveita GESTOR_UNIDADE, mesma decisão de perfil de US-104/106/107 -
  // "Financeiro" não existe como perfil próprio nesta fatia.
  async aplicar(
    tenantId: string,
    ator: UsuarioAutenticado,
    contratoDeLocacaoId: string,
    input: AplicarReajusteInput,
  ): Promise<Reajuste> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode aplicar reajuste de contrato.');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId: ator.unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      // RN-406: reajuste periódico é parte do ciclo de cobrança durante a
      // vigência (ART-010, fluxo principal, passo 6) - contrato precisa
      // estar Vigente.
      if (contrato.estado !== 'VIGENTE') {
        throw new BadRequestException('Só é possível aplicar reajuste a um contrato Vigente.');
      }

      const existente = await tx.reajuste.findFirst({
        where: { tenantId, contratoDeLocacaoId, competencia: input.competencia },
      });
      if (existente) {
        // RN-406/DEC-ARQ-006: "nunca recalculado retroativamente" - uma
        // competência já aplicada nunca é reaplicada/sobrescrita.
        throw new BadRequestException(`Já existe um reajuste aplicado para a competência ${input.competencia}.`);
      }

      // RN-407: piso zero quando o índice do período é negativo (deflação) e
      // o contrato não declarou aceitar reajuste negativo - nunca assumido
      // silenciosamente (aceitaReajusteNegativo é obrigatório desde a criação).
      const percentualAplicado =
        input.percentualIndice < 0 && !contrato.aceitaReajusteNegativo ? 0 : input.percentualIndice;

      const valorAluguelAnterior = contrato.valorAluguel.toNumber();
      const valorAluguelNovo = arredondar(valorAluguelAnterior * (1 + percentualAplicado / 100));

      const criado = await tx.reajuste.create({
        data: {
          tenantId,
          contratoDeLocacaoId,
          competencia: input.competencia,
          indice: contrato.indiceReajuste,
          percentualIndice: input.percentualIndice,
          percentualAplicado,
          valorAluguelAnterior,
          valorAluguelNovo,
        },
      });

      await tx.contratoDeLocacao.update({ where: { id: contratoDeLocacaoId }, data: { valorAluguel: valorAluguelNovo } });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'REAJUSTE_APLICADO',
        'ContratoDeLocacao',
        contratoDeLocacaoId,
        `${input.competencia}: ${valorAluguelAnterior}->${valorAluguelNovo} (${percentualAplicado}%)`,
      );

      return paraReajuste(criado);
    });
  }

  async listar(tenantId: string, unidadeId: string, contratoDeLocacaoId: string): Promise<Reajuste[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      const registros = await tx.reajuste.findMany({
        where: { tenantId, contratoDeLocacaoId },
        orderBy: { competencia: 'desc' },
      });
      return registros.map(paraReajuste);
    });
  }
}
