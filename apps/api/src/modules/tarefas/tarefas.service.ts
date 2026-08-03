import { Injectable, NotFoundException } from '@nestjs/common';
import { Tarefa as TarefaRecord } from '@prisma/client';
import { CriarTarefaInput, Tarefa } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

function paraTarefa(registro: TarefaRecord): Tarefa {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    usuarioId: registro.usuarioId,
    titulo: registro.titulo,
    concluida: registro.concluida,
    prazo: registro.prazo ? registro.prazo.toISOString() : null,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// EXTENSAO REGISTRADA (menu "Tarefas"): lembrete pessoal do usuario, sem
// vinculo com Lead/Oportunidade/etc e sem atribuicao a outro usuario. Por
// nao ser uma entidade de negocio de ART-005, escritas aqui nao geram
// RegistroDeAuditoria (esse mecanismo cobre as entidades listadas em
// ART-005 secao 9, Tarefa nao esta entre elas).
@Injectable()
export class TarefasService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async criar(tenantId: string, usuarioId: string, input: CriarTarefaInput): Promise<Tarefa> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const criada = await tx.tarefa.create({
        data: {
          tenantId,
          usuarioId,
          titulo: input.titulo,
          prazo: input.prazo ? new Date(input.prazo) : null,
        },
      });
      return paraTarefa(criada);
    });
  }

  // Sempre pessoal: so lista as tarefas do proprio chamador (sem visao de
  // equipe/unidade nesta fatia).
  async listar(tenantId: string, usuarioId: string): Promise<Tarefa[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.tarefa.findMany({
        where: { tenantId, usuarioId },
        orderBy: [{ concluida: 'asc' }, { prazo: 'asc' }, { criadoEm: 'desc' }],
      });
      return registros.map(paraTarefa);
    });
  }

  async concluir(tenantId: string, usuarioId: string, id: string): Promise<Tarefa> {
    return this.alterarConclusao(tenantId, usuarioId, id, true);
  }

  async reabrir(tenantId: string, usuarioId: string, id: string): Promise<Tarefa> {
    return this.alterarConclusao(tenantId, usuarioId, id, false);
  }

  private async alterarConclusao(
    tenantId: string,
    usuarioId: string,
    id: string,
    concluida: boolean,
  ): Promise<Tarefa> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const existente = await tx.tarefa.findFirst({ where: { id, tenantId, usuarioId } });
      if (!existente) {
        throw new NotFoundException('Tarefa não encontrada.');
      }
      const atualizada = await tx.tarefa.update({ where: { id }, data: { concluida } });
      return paraTarefa(atualizada);
    });
  }

  async remover(tenantId: string, usuarioId: string, id: string): Promise<void> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const existente = await tx.tarefa.findFirst({ where: { id, tenantId, usuarioId } });
      if (!existente) {
        throw new NotFoundException('Tarefa não encontrada.');
      }
      await tx.tarefa.delete({ where: { id } });
    });
  }
}
