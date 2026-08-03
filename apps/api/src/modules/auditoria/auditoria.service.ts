import { Injectable } from '@nestjs/common';
import { Prisma, RegistroDeAuditoria as RegistroRecord } from '@prisma/client';
import { RegistroDeAuditoria } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

function paraRegistro(registro: RegistroRecord): RegistroDeAuditoria {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    atorUsuarioId: registro.atorUsuarioId,
    acao: registro.acao,
    entidadeTipo: registro.entidadeTipo,
    entidadeId: registro.entidadeId,
    motivo: registro.motivo,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // ART-005, secao 7: RegistroDeAuditoria e append-only - por isso so existe
  // create aqui, nunca update/delete. Sempre roda DENTRO da transacao do
  // chamador (nunca abre a propria), para que o registro seja atomico com a
  // acao que ele descreve: se a acao for revertida, o registro tambem e -
  // nao faz sentido auditar algo que nao aconteceu de fato.
  // atorUsuarioId aceita null para eventos de sistema (SchedulerService,
  // varreduras agendadas sem usuario humano por tras) - ver comentario no
  // schema.prisma, model RegistroDeAuditoria.
  async registrarTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    atorUsuarioId: string | null,
    acao: string,
    entidadeTipo: string,
    entidadeId: string,
    motivo?: string,
  ): Promise<void> {
    await tx.registroDeAuditoria.create({
      data: { tenantId, atorUsuarioId, acao, entidadeTipo, entidadeId, motivo },
    });
  }

  async listar(tenantId: string, entidadeTipo?: string, entidadeId?: string): Promise<RegistroDeAuditoria[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.registroDeAuditoria.findMany({
        where: {
          tenantId,
          ...(entidadeTipo ? { entidadeTipo } : {}),
          ...(entidadeId ? { entidadeId } : {}),
        },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraRegistro);
    });
  }
}
