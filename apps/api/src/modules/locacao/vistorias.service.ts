import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Vistoria as VistoriaRecord } from '@prisma/client';
import { AgendarVistoriaInput, RealizarLaudoVistoriaInput, Vistoria } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContratosLocacaoService } from './contratos-locacao.service';

function paraVistoria(registro: VistoriaRecord): Vistoria {
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
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-106 (ART-015-backlog-fase-2.md) / RN-404 (ART-010).
// Contestação (RN-405, específica de vistoria de SAIDA) fica para US-107.
@Injectable()
export class VistoriasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
    private readonly contratosLocacaoService: ContratosLocacaoService,
  ) {}

  async agendar(tenantId: string, atorUsuarioId: string, input: AgendarVistoriaInput): Promise<Vistoria> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({ where: { id: input.contratoDeLocacaoId, tenantId } });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado neste tenant.');
      }
      // Coerência com a máquina de estados: só faz sentido agendar a
      // vistoria de ENTRADA quando o contrato já está esperando por ela.
      if (input.tipo === 'ENTRADA' && contrato.estado !== 'AGUARDANDO_VISTORIA_ENTRADA') {
        throw new BadRequestException(
          'O contrato não está aguardando vistoria de entrada (verifique o estado do contrato).',
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
      const vistoria = await tx.vistoria.findFirst({ where: { id: vistoriaId, tenantId } });
      if (!vistoria) {
        throw new NotFoundException('Vistoria não encontrada neste tenant.');
      }
      if (vistoria.estado !== 'AGENDADA') {
        throw new BadRequestException(`Vistoria está em estado "${vistoria.estado}"; só é possível registrar laudo de uma vistoria agendada.`);
      }

      const atualizada = await tx.vistoria.update({
        where: { id: vistoriaId },
        data: { estado: 'REALIZADA', laudo: input.laudo, evidencias: input.evidencias, realizadaEm: new Date() },
      });

      await this.auditoriaService.registrarTx(tx, tenantId, ator.id, 'VISTORIA_REALIZADA', 'Vistoria', vistoriaId);

      if (vistoria.tipo === 'ENTRADA') {
        await this.contratosLocacaoService.moverEstagioTx(tx, tenantId, vistoria.contratoDeLocacaoId, 'VIGENTE', ator.id);
      }

      return paraVistoria(atualizada);
    });
  }

  async listar(tenantId: string, contratoDeLocacaoId: string): Promise<Vistoria[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({ where: { id: contratoDeLocacaoId, tenantId } });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado neste tenant.');
      }
      const registros = await tx.vistoria.findMany({
        where: { tenantId, contratoDeLocacaoId },
        orderBy: { dataHora: 'asc' },
      });
      return registros.map(paraVistoria);
    });
  }
}
