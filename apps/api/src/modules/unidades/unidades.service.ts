import { Injectable } from '@nestjs/common';
import { Unidade as UnidadeRecord } from '@prisma/client';
import { CriarUnidadeInput, Unidade } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

export interface CriarUnidadeResultado {
  unidade: Unidade;
  possivelDuplicidade: boolean;
}

function paraUnidade(registro: UnidadeRecord): Unidade {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    nomeFantasia: registro.nomeFantasia,
    status: registro.status,
    eMatriz: registro.eMatriz,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class UnidadesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // US-001 / CA-001 e CA-002 (ART-014): cria a unidade sempre no tenant do
  // requisitante (RLS + filtro explicito de aplicacao) e sinaliza possivel
  // duplicidade de nome sem bloquear o cadastro (nome nao e chave de
  // unicidade tecnica, conforme ART-014).
  async criar(tenantId: string, input: CriarUnidadeInput): Promise<CriarUnidadeResultado> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const existente = await tx.unidade.findFirst({
        where: { tenantId, nomeFantasia: input.nomeFantasia },
      });

      const criada = await tx.unidade.create({
        data: {
          tenantId,
          nomeFantasia: input.nomeFantasia,
          eMatriz: input.eMatriz ?? false,
        },
      });

      return {
        unidade: paraUnidade(criada),
        possivelDuplicidade: existente !== null,
      };
    });
  }

  async listar(tenantId: string): Promise<Unidade[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.unidade.findMany({
        where: { tenantId },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraUnidade);
    });
  }
}
