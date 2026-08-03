import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Visita as VisitaRecord } from '@prisma/client';
import { AgendarVisitaInput, RealizarVisitaInput, Visita } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';

/** RN-303 (ART-009): prazo de alerta antes da visita sem confirmação - hipótese de trabalho. */
const PRAZO_ALERTA_HORAS = 24;

function paraVisita(registro: VisitaRecord): Visita {
  const precisaAlerta =
    registro.estado === 'AGENDADA' &&
    registro.dataHora.getTime() - Date.now() <= PRAZO_ALERTA_HORAS * 60 * 60 * 1000;

  return {
    id: registro.id,
    tenantId: registro.tenantId,
    oportunidadeId: registro.oportunidadeId,
    dataHora: registro.dataHora.toISOString(),
    estado: registro.estado,
    resultado: registro.resultado,
    criadoEm: registro.criadoEm.toISOString(),
    precisaAlerta,
  };
}

@Injectable()
export class VisitasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly oportunidadesService: OportunidadesService,
  ) {}

  // US-014 (ART-014) / RN-303 (ART-009): agenda a visita e sincroniza a
  // oportunidade para VISITA_AGENDADA - mas so quando a oportunidade ainda
  // esta em QUALIFICACAO, para nao quebrar remarcacao (visita cancelada e
  // reagendada com a oportunidade ja avancada nao deve tentar retroceder).
  // PENDENCIA DE README FECHADA: "Permissões" de US-014 ("responsável pela
  // oportunidade") nao era verificada.
  async agendar(tenantId: string, input: AgendarVisitaInput, usuarioId: string): Promise<Visita> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await this.oportunidadesService.validarResponsavelDaOportunidade(
        tx,
        tenantId,
        input.oportunidadeId,
        usuarioId,
      );

      const criada = await tx.visita.create({
        data: { tenantId, oportunidadeId: input.oportunidadeId, dataHora: new Date(input.dataHora) },
      });

      if (oportunidade.estado === 'QUALIFICACAO') {
        await this.oportunidadesService.moverEstagioTx(
          tx,
          tenantId,
          input.oportunidadeId,
          'VISITA_AGENDADA',
          usuarioId,
        );
      }

      return paraVisita(criada);
    });
  }

  // PENDENCIA DE README FECHADA: leitura nao verificava unidade - ver mesma
  // nota em PropostasService.listarPorOportunidade.
  async listarPorOportunidade(tenantId: string, oportunidadeId: string, unidadeId: string): Promise<Visita[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await tx.oportunidade.findFirst({
        where: { id: oportunidadeId, tenantId, lead: { unidadeId } },
      });
      if (!oportunidade) {
        throw new NotFoundException('Oportunidade não encontrada nesta unidade.');
      }
      const registros = await tx.visita.findMany({
        where: { tenantId, oportunidadeId },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraVisita);
    });
  }

  // Base da tela "Visitas" (visao cruzada, fora do escopo de uma
  // oportunidade). Mesmo escopo por unidade de listarPorOportunidade.
  async listarTodas(tenantId: string, unidadeId: string): Promise<Visita[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.visita.findMany({
        where: { tenantId, oportunidade: { lead: { unidadeId } } },
        orderBy: { dataHora: 'asc' },
      });
      return registros.map(paraVisita);
    });
  }

  // US-014 / CA-001 (ART-014): confirmação move Visita e Oportunidade juntas.
  // PENDENCIA DE README FECHADA: "Permissões" ("responsável pela oportunidade") nao era verificada.
  async confirmar(tenantId: string, visitaId: string, atorUsuarioId: string): Promise<Visita> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const visita = await tx.visita.findFirst({ where: { id: visitaId, tenantId } });
      if (!visita) {
        throw new NotFoundException('Visita não encontrada neste tenant.');
      }
      await this.oportunidadesService.validarResponsavelDaOportunidade(tx, tenantId, visita.oportunidadeId, atorUsuarioId);
      if (visita.estado !== 'AGENDADA') {
        throw new BadRequestException(`Visita está em estado "${visita.estado}"; só é possível confirmar uma visita agendada.`);
      }

      const atualizada = await tx.visita.update({ where: { id: visitaId }, data: { estado: 'CONFIRMADA' } });

      const oportunidade = await tx.oportunidade.findFirst({ where: { id: visita.oportunidadeId, tenantId } });
      if (oportunidade?.estado === 'VISITA_AGENDADA') {
        await this.oportunidadesService.moverEstagioTx(
          tx,
          tenantId,
          visita.oportunidadeId,
          'VISITA_CONFIRMADA',
          atorUsuarioId,
        );
      }

      return paraVisita(atualizada);
    });
  }

  // RN-303, seção 11 de ART-009 (cenário de exceção): cancelamento preserva
  // o histórico - nunca apaga a visita, só muda o estado. Remarcação é uma
  // nova chamada a agendar().
  // PENDENCIA DE README FECHADA: "Permissões" ("responsável pela oportunidade") nao era verificada.
  async cancelar(tenantId: string, visitaId: string, atorUsuarioId: string): Promise<Visita> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const visita = await tx.visita.findFirst({ where: { id: visitaId, tenantId } });
      if (!visita) {
        throw new NotFoundException('Visita não encontrada neste tenant.');
      }
      await this.oportunidadesService.validarResponsavelDaOportunidade(tx, tenantId, visita.oportunidadeId, atorUsuarioId);
      if (visita.estado === 'REALIZADA' || visita.estado === 'CANCELADA') {
        throw new BadRequestException(`Visita em estado "${visita.estado}" não pode ser cancelada.`);
      }
      const atualizada = await tx.visita.update({ where: { id: visitaId }, data: { estado: 'CANCELADA' } });
      return paraVisita(atualizada);
    });
  }

  // US-015 / CA-001 (ART-014): exige resultado de uma lista fechada antes de
  // marcar como realizada; "nao compareceu" nao encerra a oportunidade
  // automaticamente (cenario de excecao) - so avanca a oportunidade quando
  // o resultado indica seguimento real.
  // PENDENCIA DE README FECHADA: "Permissões" ("responsável pela oportunidade") nao era verificada.
  async realizar(
    tenantId: string,
    visitaId: string,
    input: RealizarVisitaInput,
    atorUsuarioId: string,
  ): Promise<Visita> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const visita = await tx.visita.findFirst({ where: { id: visitaId, tenantId } });
      if (!visita) {
        throw new NotFoundException('Visita não encontrada neste tenant.');
      }
      await this.oportunidadesService.validarResponsavelDaOportunidade(tx, tenantId, visita.oportunidadeId, atorUsuarioId);
      if (visita.estado !== 'CONFIRMADA') {
        throw new BadRequestException(`Visita está em estado "${visita.estado}"; só é possível concluir uma visita confirmada.`);
      }

      const atualizada = await tx.visita.update({
        where: { id: visitaId },
        data: { estado: 'REALIZADA', resultado: input.resultado },
      });

      if (input.resultado !== 'NAO_COMPARECEU') {
        const oportunidade = await tx.oportunidade.findFirst({ where: { id: visita.oportunidadeId, tenantId } });
        if (oportunidade?.estado === 'VISITA_CONFIRMADA') {
          await this.oportunidadesService.moverEstagioTx(
            tx,
            tenantId,
            visita.oportunidadeId,
            'VISITA_REALIZADA',
            atorUsuarioId,
          );
        }
      }

      return paraVisita(atualizada);
    });
  }
}
