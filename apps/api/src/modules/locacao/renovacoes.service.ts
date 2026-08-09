import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Renovacao as RenovacaoRecord } from '@prisma/client';
import { ConfirmarRenovacaoInput, Renovacao } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { somarMeses } from './contratos-locacao.service';

// Exportada para reaproveitar em PortalService (US-113) sem duplicar mapeamento.
export function paraRenovacao(registro: RenovacaoRecord): Renovacao {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    contratoDeLocacaoId: registro.contratoDeLocacaoId,
    prazoAdicionalMeses: registro.prazoAdicionalMeses,
    vencimentoAnterior: registro.vencimentoAnterior.toISOString().slice(0, 10),
    novoVencimento: registro.novoVencimento.toISOString().slice(0, 10),
    confirmadoPorUsuarioId: registro.confirmadoPorUsuarioId,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-109 (ART-015-backlog-fase-2.md) / RN-408, RN-412 (ART-010).
// RN-408: "renovação... exige confirmação humana registrada, nunca
// automaticamente por decurso de prazo" - o oposto (ausência de renovação
// até o vencimento) é RN-409/US-110, coberto por
// ContratosLocacaoService.executarVarreduraAutomaticaTx.
@Injectable()
export class RenovacoesService {
  // Permissão: EXTENSÃO REGISTRADA - ART-010 §13 não cita "confirmar
  // renovação" explicitamente. Reaproveita GESTOR_UNIDADE, mesma decisão de
  // perfil de US-104/106/107/108 - decisão contratual sensível, "Financeiro"
  // não existe como perfil próprio nesta fatia.
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async confirmar(
    tenantId: string,
    ator: UsuarioAutenticado,
    contratoDeLocacaoId: string,
    input: ConfirmarRenovacaoInput,
  ): Promise<Renovacao> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode confirmar a renovação de um contrato.');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId: ator.unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      // RN-408 só faz sentido pra um contrato ainda vigente - depois de
      // EM_ENCERRAMENTO (RN-409) a decisão já foi tomada pela ausência de
      // confirmação a tempo; renovar nesse ponto seria reescrever o passado.
      if (contrato.estado !== 'VIGENTE') {
        throw new BadRequestException('Só é possível confirmar renovação de um contrato Vigente.');
      }

      const vencimentoAnterior = contrato.vencimentoAtual;
      const novoVencimento = somarMeses(vencimentoAnterior, input.prazoAdicionalMeses);

      const criada = await tx.renovacao.create({
        data: {
          tenantId,
          contratoDeLocacaoId,
          prazoAdicionalMeses: input.prazoAdicionalMeses,
          vencimentoAnterior,
          novoVencimento,
          confirmadoPorUsuarioId: ator.id,
        },
      });

      await tx.contratoDeLocacao.update({ where: { id: contratoDeLocacaoId }, data: { vencimentoAtual: novoVencimento } });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'CONTRATO_LOCACAO_RENOVADO',
        'ContratoDeLocacao',
        contratoDeLocacaoId,
        `+${input.prazoAdicionalMeses} meses: ${vencimentoAnterior.toISOString().slice(0, 10)}->${novoVencimento.toISOString().slice(0, 10)}`,
      );

      return paraRenovacao(criada);
    });
  }

  async listar(tenantId: string, unidadeId: string, contratoDeLocacaoId: string): Promise<Renovacao[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      const registros = await tx.renovacao.findMany({
        where: { tenantId, contratoDeLocacaoId },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraRenovacao);
    });
  }
}
