import { Injectable } from '@nestjs/common';
import { Pessoa as PessoaRecord } from '@prisma/client';
import { CriarPessoaInput, Pessoa } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';

function paraPessoa(registro: PessoaRecord): Pessoa {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    tipo: registro.tipo,
    nome: registro.nome,
    documentoNormalizado: registro.documentoNormalizado,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class PessoasService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async criar(tenantId: string, input: CriarPessoaInput): Promise<Pessoa> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const criada = await tx.pessoa.create({
        data: {
          tenantId,
          tipo: input.tipo,
          nome: input.nome,
          documentoNormalizado: input.documentoNormalizado,
        },
      });
      return paraPessoa(criada);
    });
  }

  async listar(tenantId: string): Promise<Pessoa[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.pessoa.findMany({
        where: { tenantId },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraPessoa);
    });
  }
}
