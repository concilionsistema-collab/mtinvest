import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Reserva as ReservaRecord, Prisma } from '@prisma/client';
import { FormalizarReservaInput, Reserva } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

/** DEC-NEG-012 (pendente): prazo de reserva - hipótese de trabalho (sugestão inicial do artefato: 5 dias úteis; simplificado aqui para 5 dias corridos). */
const PRAZO_RESERVA_DIAS = 5;

function paraReserva(registro: ReservaRecord): Reserva {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    oportunidadeId: registro.oportunidadeId,
    propostaId: registro.propostaId,
    estado: registro.estado,
    expiraEm: registro.expiraEm.toISOString(),
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class ReservasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly oportunidadesService: OportunidadesService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // US-018 / CA-001 (ART-014) / RN-307 (ART-009): so formaliza reserva de
  // proposta ACEITA; o bloqueio de outras oportunidades concorrentes sobre o
  // mesmo imovel e feito por moverEstagioTx (Oportunidade.estado = RESERVA).
  // PENDENCIA DE README FECHADA: "Permissões" de US-018 ("responsável pela
  // oportunidade") nao era verificada - qualquer usuario do tenant
  // conseguia formalizar reserva de qualquer oportunidade.
  async formalizar(
    tenantId: string,
    oportunidadeId: string,
    input: FormalizarReservaInput,
    usuarioId: string,
  ): Promise<Reserva> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      await this.oportunidadesService.validarResponsavelDaOportunidade(tx, tenantId, oportunidadeId, usuarioId);

      const proposta = await tx.proposta.findFirst({ where: { id: input.propostaId, tenantId, oportunidadeId } });
      if (!proposta) {
        throw new BadRequestException('A proposta informada não existe ou não pertence a esta oportunidade.');
      }
      if (proposta.status !== 'ACEITA') {
        throw new BadRequestException('Só é possível formalizar reserva a partir de uma proposta aceita (CA-001, US-018).');
      }

      await this.oportunidadesService.moverEstagioTx(tx, tenantId, oportunidadeId, 'RESERVA', usuarioId);

      const expiraEm = new Date(Date.now() + PRAZO_RESERVA_DIAS * 24 * 60 * 60 * 1000);
      const criada = await tx.reserva.create({
        data: { tenantId, oportunidadeId, propostaId: input.propostaId, expiraEm },
      });

      return paraReserva(criada);
    });
  }

  // US-018 / CA-002 (ART-014): expira automaticamente reservas vencidas.
  // Roda tanto "preguicosamente" (a cada listagem, para consistencia
  // imediata) quanto via SchedulerService (varredura agendada real, ver
  // executarVarreduraAutomaticaTx). Libera o "cadeado" RN-307 (marca a
  // Reserva EXPIRADA); a Oportunidade permanece no estado RESERVA (nao ha
  // estado de destino definido no mapa de ART-009 para essa reversao) - fica
  // sinalizado pelo estado da Reserva, nao escondido. ATUALIZADO: gera
  // RegistroDeAuditoria com ator sistema (null) por reserva expirada -
  // ART-005, secao 9 nao lista Reserva.estado como item obrigatorio, mas
  // segue o mesmo espirito ja aplicado a TransferenciaDeCarteira/Oportunidade.
  private async expirarVencidas(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const vencidas = await tx.reserva.findMany({
      where: { tenantId, estado: 'ATIVA', expiraEm: { lt: new Date() } },
    });
    for (const reserva of vencidas) {
      await tx.reserva.update({ where: { id: reserva.id }, data: { estado: 'EXPIRADA' } });
      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        null,
        'RESERVA_ESTADO_ALTERADO',
        'Reserva',
        reserva.id,
        `ATIVA->EXPIRADA (prazo de ${PRAZO_RESERVA_DIAS} dias vencido, RN-307/US-018)`,
      );
    }
  }

  // SchedulerService (jobs reais - README, "Próximos passos sugeridos"):
  // ponto de entrada unico para a varredura agendada deste modulo.
  async executarVarreduraAutomaticaTx(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await this.expirarVencidas(tx, tenantId);
  }

  // PENDENCIA DE README FECHADA: leitura nao verificava unidade - ver mesma
  // nota em PropostasService.listarPorOportunidade.
  async listarPorOportunidade(tenantId: string, oportunidadeId: string, unidadeId: string): Promise<Reserva[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await tx.oportunidade.findFirst({
        where: { id: oportunidadeId, tenantId, lead: { unidadeId } },
      });
      if (!oportunidade) {
        throw new NotFoundException('Oportunidade não encontrada nesta unidade.');
      }
      await this.expirarVencidas(tx, tenantId);
      const registros = await tx.reserva.findMany({
        where: { tenantId, oportunidadeId },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraReserva);
    });
  }
}
