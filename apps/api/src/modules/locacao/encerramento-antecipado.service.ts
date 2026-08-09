import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EncerramentoAntecipado as EncerramentoRecord } from '@prisma/client';
import { EncerramentoAntecipado, SolicitarEncerramentoAntecipadoInput } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContratosLocacaoService } from './contratos-locacao.service';

// BLOQUEIO DE PRODUCAO REGISTRADO (ART-010 secao 21, DEC-NEG-017 pendente):
// "a formula proporcional apresentada e uma HIPOTESE DE TRABALHO TECNICA,
// nao uma afirmacao juridica... bloquear uso em producao real ate validacao
// juridica explicita, mesmo que o desenho tecnico avance". Por padrao (env
// var ausente ou != 'true'), TODA chamada e recusada, mesmo de
// GESTOR_UNIDADE - so alguem com acesso ao ambiente do servidor, ciente do
// risco, pode ligar isto explicitamente. Nao e feature flag de
// desenvolvimento, e um gate de conformidade exigido pelo proprio artefato.
const ENV_HABILITACAO = 'LOCACAO_MULTA_RESCISORIA_HABILITADA';

function bloqueadoParaProducao(): boolean {
  return process.env[ENV_HABILITACAO] !== 'true';
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// DEC-NEG-017: granularidade de mes-calendario (ano*12+mes), ignorando dia
// do mes - SIMPLIFICACAO REGISTRADA, mesma natureza de hipotese tecnica do
// resto desta feature (nao e um instrumento de precisao juridica).
function mesesEntre(hoje: Date, vencimento: Date): number {
  const meses =
    (vencimento.getUTCFullYear() - hoje.getUTCFullYear()) * 12 + (vencimento.getUTCMonth() - hoje.getUTCMonth());
  return Math.max(meses, 0);
}

function paraEncerramento(registro: EncerramentoRecord): EncerramentoAntecipado {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    contratoDeLocacaoId: registro.contratoDeLocacaoId,
    valorReferencia: registro.valorReferencia.toNumber(),
    mesesRestantes: registro.mesesRestantes,
    mesesTotais: registro.mesesTotais,
    percentualProporcional: registro.percentualProporcional.toNumber(),
    valorMulta: registro.valorMulta.toNumber(),
    isento: registro.isento,
    motivoIsencao: registro.motivoIsencao,
    confirmadoPorUsuarioId: registro.confirmadoPorUsuarioId,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-111 (ART-015-backlog-fase-2.md) / RN-410, CA-405 (ART-010).
@Injectable()
export class EncerramentoAntecipadoService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
    private readonly contratosLocacaoService: ContratosLocacaoService,
  ) {}

  async solicitar(
    tenantId: string,
    ator: UsuarioAutenticado,
    contratoDeLocacaoId: string,
    input: SolicitarEncerramentoAntecipadoInput,
  ): Promise<EncerramentoAntecipado> {
    if (bloqueadoParaProducao()) {
      throw new ForbiddenException(
        `Encerramento antecipado com multa está bloqueado para uso em produção real até validação jurídica formal da fórmula (ART-010 §21, DEC-NEG-017 ainda pendente). Defina ${ENV_HABILITACAO}=true no ambiente do servidor para habilitar em teste/homologação, por sua conta e risco.`,
      );
    }
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode solicitar encerramento antecipado de contrato.');
    }
    if (input.isento && (!input.motivoIsencao || input.motivoIsencao.trim().length < 3)) {
      throw new BadRequestException('Isenção de multa exige apuração formal registrada (motivoIsencao, RN-410).');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId: ator.unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      if (contrato.estado !== 'VIGENTE') {
        throw new BadRequestException('Só é possível solicitar encerramento antecipado de um contrato Vigente.');
      }

      const hoje = new Date();
      if (contrato.vencimentoAtual <= hoje) {
        throw new BadRequestException(
          'O contrato já atingiu o vencimento do período atual — isto não é mais um encerramento antecipado.',
        );
      }

      const mesesRestantes = mesesEntre(hoje, contrato.vencimentoAtual);
      const mesesTotais = contrato.prazoMeses;
      const valorReferencia = contrato.valorAluguel.toNumber();
      // Nunca multa maior que o valor de referencia, mesmo se uma renovacao
      // (US-109) tiver empurrado o vencimento alem do prazo original.
      const percentualProporcional = input.isento ? 0 : Math.min(1, mesesRestantes / mesesTotais);
      const valorMulta = input.isento ? 0 : arredondar(valorReferencia * percentualProporcional);

      const criado = await tx.encerramentoAntecipado.create({
        data: {
          tenantId,
          contratoDeLocacaoId,
          valorReferencia,
          mesesRestantes,
          mesesTotais,
          percentualProporcional,
          valorMulta,
          isento: Boolean(input.isento),
          motivoIsencao: input.isento ? input.motivoIsencao : null,
          confirmadoPorUsuarioId: ator.id,
        },
      });

      await this.contratosLocacaoService.moverEstagioTx(tx, tenantId, contratoDeLocacaoId, 'EM_ENCERRAMENTO_ANTECIPADO', ator.id);

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'ENCERRAMENTO_ANTECIPADO_SOLICITADO',
        'ContratoDeLocacao',
        contratoDeLocacaoId,
        input.isento ? `isento: ${input.motivoIsencao}` : `multa=${valorMulta}`,
      );

      return paraEncerramento(criado);
    });
  }

  async listar(tenantId: string, unidadeId: string, contratoDeLocacaoId: string): Promise<EncerramentoAntecipado[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      const registros = await tx.encerramentoAntecipado.findMany({
        where: { tenantId, contratoDeLocacaoId },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraEncerramento);
    });
  }
}
