import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Vistoria as VistoriaRecord } from '@prisma/client';
import {
  AgendarVistoriaInput,
  ContestacaoDeVistoria,
  DecidirContestacaoInput,
  RealizarLaudoVistoriaInput,
  RegistrarContestacaoInput,
  Vistoria,
} from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContratosLocacaoService } from './contratos-locacao.service';

// DEC-NEG-016 (pendente, "Opção C" - recomendação técnica): 5 dias úteis,
// hipótese de trabalho. SIMPLIFICAÇÃO REGISTRADA: conta só sábado/domingo
// como não-útil, sem calendário de feriados nesta fatia.
const PRAZO_CONTESTACAO_DIAS_UTEIS = 5;

function somarDiasUteis(base: Date, dias: number): Date {
  const resultado = new Date(base);
  let restantes = dias;
  while (restantes > 0) {
    resultado.setDate(resultado.getDate() + 1);
    const diaDaSemana = resultado.getDay();
    if (diaDaSemana !== 0 && diaDaSemana !== 6) {
      restantes -= 1;
    }
  }
  return resultado;
}

// Exportada para reaproveitar em PortalService (US-113) sem duplicar mapeamento.
export function paraVistoria(registro: VistoriaRecord): Vistoria {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    contratoDeLocacaoId: registro.contratoDeLocacaoId,
    tipo: registro.tipo,
    estado: registro.estado,
    dataHora: registro.dataHora.toISOString(),
    laudo: registro.laudo,
    evidencias: registro.evidencias,
    realizadaEm: registro.realizadaEm ? registro.realizadaEm.toISOString() : null,
    realizadoPorUsuarioId: registro.realizadoPorUsuarioId,
    prazoContestacaoAte: registro.prazoContestacaoAte ? registro.prazoContestacaoAte.toISOString() : null,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

function paraContestacao(registro: {
  id: string;
  tenantId: string;
  vistoriaId: string;
  motivo: string;
  evidencia: string | null;
  contestadoPorUsuarioId: string;
  analistaUsuarioId: string | null;
  decisao: 'CONFIRMADA' | 'RETIFICADA' | null;
  justificativaDecisao: string | null;
  criadoEm: Date;
  decididoEm: Date | null;
}): ContestacaoDeVistoria {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    vistoriaId: registro.vistoriaId,
    motivo: registro.motivo,
    evidencia: registro.evidencia,
    contestadoPorUsuarioId: registro.contestadoPorUsuarioId,
    analistaUsuarioId: registro.analistaUsuarioId,
    decisao: registro.decisao,
    justificativaDecisao: registro.justificativaDecisao,
    criadoEm: registro.criadoEm.toISOString(),
    decididoEm: registro.decididoEm ? registro.decididoEm.toISOString() : null,
  };
}

// Implementa US-106/US-107 (ART-015-backlog-fase-2.md) / RN-404, RN-405 (ART-010).
// CORREÇÃO DE SEGURANÇA REGISTRADA (revisão de 2026-08-08): todo método
// aqui só checava tenantId, nunca a unidade do contrato - corrigido
// escopando pela unidade do contrato de administração (mesmo padrão de
// GarantiasService).
@Injectable()
export class VistoriasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
    private readonly contratosLocacaoService: ContratosLocacaoService,
  ) {}

  async agendar(tenantId: string, atorUsuarioId: string, unidadeId: string, input: AgendarVistoriaInput): Promise<Vistoria> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: input.contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      // Coerência com a máquina de estados: só faz sentido agendar a
      // vistoria de ENTRADA quando o contrato já está esperando por ela.
      if (input.tipo === 'ENTRADA' && contrato.estado !== 'AGUARDANDO_VISTORIA_ENTRADA') {
        throw new BadRequestException(
          'O contrato não está aguardando vistoria de entrada (verifique o estado do contrato).',
        );
      }
      // EXTENSÃO REGISTRADA (US-107): ART-010 §8.1 modela a vistoria de saída
      // dentro de "Em encerramento"/"Em encerramento antecipado", mas essas
      // transições (US-109/110/111) ainda não existem nesta fatia - sem essa
      // permissão, US-107 nunca seria exercitável. Aceita também VIGENTE
      // (estado real alcançável hoje); os dois estados de encerramento ficam
      // aceitos desde já para não exigir mudança aqui quando existirem.
      if (
        input.tipo === 'SAIDA' &&
        !['VIGENTE', 'EM_ENCERRAMENTO', 'EM_ENCERRAMENTO_ANTECIPADO'].includes(contrato.estado)
      ) {
        throw new BadRequestException(
          'A vistoria de saída só pode ser agendada com o contrato Vigente ou em encerramento.',
        );
      }

      const criada = await tx.vistoria.create({
        data: {
          tenantId,
          contratoDeLocacaoId: input.contratoDeLocacaoId,
          tipo: input.tipo,
          dataHora: new Date(input.dataHora),
        },
      });

      await this.auditoriaService.registrarTx(tx, tenantId, atorUsuarioId, 'VISTORIA_AGENDADA', 'Vistoria', criada.id);

      return paraVistoria(criada);
    });
  }

  // RN-404: ao registrar o laudo de uma vistoria de ENTRADA, aciona
  // automaticamente ContratoDeLocacao AGUARDANDO_VISTORIA_ENTRADA -> VIGENTE
  // na MESMA transação (mesmo padrão de VisitasService acionando
  // OportunidadesService.moverEstagioTx) - nunca fica um estado dessincronizado
  // do outro. Permissão (ART-010 §13, "apenas Vistoriador"): reaproveita
  // GESTOR_UNIDADE nesta fatia (sem perfil próprio ainda, decisão registrada).
  async realizarLaudo(
    tenantId: string,
    ator: UsuarioAutenticado,
    vistoriaId: string,
    input: RealizarLaudoVistoriaInput,
  ): Promise<Vistoria> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode registrar o laudo de vistoria (ART-010, §13).');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const vistoria = await tx.vistoria.findFirst({
        where: { id: vistoriaId, tenantId, contratoDeLocacao: { contratoDeAdministracao: { unidadeId: ator.unidadeId } } },
      });
      if (!vistoria) {
        throw new NotFoundException('Vistoria não encontrada nesta unidade.');
      }
      if (vistoria.estado !== 'AGENDADA') {
        throw new BadRequestException(`Vistoria está em estado "${vistoria.estado}"; só é possível registrar laudo de uma vistoria agendada.`);
      }

      const realizadaEm = new Date();
      // US-107/DEC-NEG-016: prazo formal de contestação só se aplica à
      // vistoria de SAIDA - a de ENTRADA nunca é contestada nesta fatia
      // (RN-405/ART-010 §8.3 só fala de contestação "ao final do contrato").
      const prazoContestacaoAte = vistoria.tipo === 'SAIDA' ? somarDiasUteis(realizadaEm, PRAZO_CONTESTACAO_DIAS_UTEIS) : null;

      const atualizada = await tx.vistoria.update({
        where: { id: vistoriaId },
        data: {
          estado: 'REALIZADA',
          laudo: input.laudo,
          evidencias: input.evidencias,
          realizadaEm,
          realizadoPorUsuarioId: ator.id,
          prazoContestacaoAte,
        },
      });

      await this.auditoriaService.registrarTx(tx, tenantId, ator.id, 'VISTORIA_REALIZADA', 'Vistoria', vistoriaId);

      if (vistoria.tipo === 'ENTRADA') {
        await this.contratosLocacaoService.moverEstagioTx(tx, tenantId, vistoria.contratoDeLocacaoId, 'VIGENTE', ator.id);
      }

      return paraVistoria(atualizada);
    });
  }

  // RN-405/DEC-NEG-016: abre a contestação dentro do prazo formal. Canal
  // assistido (RN-413: portal do proprietário/inquilino é só leitura nesta
  // fase) - qualquer usuário autenticado do tenant registra em nome da parte,
  // sem restrição de perfil (só a DECISÃO, abaixo, é restrita).
  async registrarContestacao(
    tenantId: string,
    atorUsuarioId: string,
    unidadeId: string,
    vistoriaId: string,
    input: RegistrarContestacaoInput,
  ): Promise<ContestacaoDeVistoria> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const vistoria = await tx.vistoria.findFirst({
        where: { id: vistoriaId, tenantId, contratoDeLocacao: { contratoDeAdministracao: { unidadeId } } },
      });
      if (!vistoria) {
        throw new NotFoundException('Vistoria não encontrada nesta unidade.');
      }
      // EXTENSÃO REGISTRADA: contestação exclusiva de vistoria de SAIDA (ver
      // comentário em realizarLaudo).
      if (vistoria.tipo !== 'SAIDA') {
        throw new BadRequestException('Só é possível contestar uma vistoria de saída (RN-405).');
      }
      if (vistoria.estado !== 'REALIZADA') {
        throw new BadRequestException(`Vistoria está em estado "${vistoria.estado}"; só é possível contestar uma vistoria recém-realizada, ainda sem decisão.`);
      }
      if (!vistoria.prazoContestacaoAte || new Date() > vistoria.prazoContestacaoAte) {
        throw new BadRequestException('O prazo formal de contestação desta vistoria já expirou (DEC-NEG-016).');
      }

      const criada = await tx.contestacaoDeVistoria.create({
        data: {
          tenantId,
          vistoriaId,
          motivo: input.motivo,
          evidencia: input.evidencia,
          contestadoPorUsuarioId: atorUsuarioId,
        },
      });

      await tx.vistoria.update({ where: { id: vistoriaId }, data: { estado: 'EM_CONTESTACAO' } });

      await this.auditoriaService.registrarTx(tx, tenantId, atorUsuarioId, 'VISTORIA_CONTESTADA', 'Vistoria', vistoriaId);

      return paraContestacao(criada);
    });
  }

  // RN-405/CA-403/TEST-403: só um analista distinto do autor da vistoria
  // original decide. Reaproveita GESTOR_UNIDADE (mesma decisão de perfil de
  // realizarLaudo) - a segregação real é "não pode ser a mesma pessoa que
  // fez o laudo", verificada abaixo por identidade de usuário, não por perfil.
  async decidirContestacao(
    tenantId: string,
    ator: UsuarioAutenticado,
    vistoriaId: string,
    input: DecidirContestacaoInput,
  ): Promise<ContestacaoDeVistoria> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode decidir uma contestação de vistoria (ART-010, §13).');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const vistoria = await tx.vistoria.findFirst({
        where: { id: vistoriaId, tenantId, contratoDeLocacao: { contratoDeAdministracao: { unidadeId: ator.unidadeId } } },
      });
      if (!vistoria) {
        throw new NotFoundException('Vistoria não encontrada nesta unidade.');
      }
      if (vistoria.estado !== 'EM_CONTESTACAO') {
        throw new BadRequestException(`Vistoria está em estado "${vistoria.estado}"; não há contestação pendente de decisão.`);
      }
      if (vistoria.realizadoPorUsuarioId === ator.id) {
        throw new ForbiddenException(
          'Quem registrou o laudo original não pode decidir a própria contestação (RN-405, segregação de função).',
        );
      }

      const contestacao = await tx.contestacaoDeVistoria.findFirst({
        where: { tenantId, vistoriaId, decisao: null },
        orderBy: { criadoEm: 'desc' },
      });
      if (!contestacao) {
        throw new NotFoundException('Nenhuma contestação pendente encontrada para esta vistoria.');
      }

      const decididoEm = new Date();
      const contestacaoDecidida = await tx.contestacaoDeVistoria.update({
        where: { id: contestacao.id },
        data: {
          analistaUsuarioId: ator.id,
          decisao: input.decisao,
          justificativaDecisao: input.justificativaDecisao,
          decididoEm,
        },
      });

      await tx.vistoria.update({ where: { id: vistoriaId }, data: { estado: input.decisao } });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'VISTORIA_CONTESTACAO_DECIDIDA',
        'Vistoria',
        vistoriaId,
        input.decisao,
      );

      return paraContestacao(contestacaoDecidida);
    });
  }

  // ART-010 §8.3: "prazo de contestação decorre sem contestação -> Confirmada".
  // Mesmo padrão de SchedulerService (ver ReservasService.executarVarreduraAutomaticaTx)
  // - varredura tenant-scoped, ator sistema (null).
  async executarVarreduraAutomaticaTx(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const vencidas = await tx.vistoria.findMany({
      where: { tenantId, estado: 'REALIZADA', tipo: 'SAIDA', prazoContestacaoAte: { lt: new Date() } },
    });
    for (const vistoria of vencidas) {
      await tx.vistoria.update({ where: { id: vistoria.id }, data: { estado: 'CONFIRMADA' } });
      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        null,
        'VISTORIA_ESTADO_ALTERADO',
        'Vistoria',
        vistoria.id,
        `REALIZADA->CONFIRMADA (prazo de contestação de ${PRAZO_CONTESTACAO_DIAS_UTEIS} dias úteis vencido sem contestação, RN-405)`,
      );
    }
  }

  async listar(tenantId: string, unidadeId: string, contratoDeLocacaoId: string): Promise<Vistoria[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      const registros = await tx.vistoria.findMany({
        where: { tenantId, contratoDeLocacaoId },
        orderBy: { dataHora: 'asc' },
      });
      return registros.map(paraVistoria);
    });
  }

  async listarContestacoes(tenantId: string, unidadeId: string, vistoriaId: string): Promise<ContestacaoDeVistoria[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const vistoria = await tx.vistoria.findFirst({
        where: { id: vistoriaId, tenantId, contratoDeLocacao: { contratoDeAdministracao: { unidadeId } } },
      });
      if (!vistoria) {
        throw new NotFoundException('Vistoria não encontrada nesta unidade.');
      }
      const registros = await tx.contestacaoDeVistoria.findMany({
        where: { tenantId, vistoriaId },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraContestacao);
    });
  }
}
