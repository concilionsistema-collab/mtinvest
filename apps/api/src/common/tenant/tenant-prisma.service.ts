import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TenantScopedClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Executa uma unidade de trabalho dentro de uma transacao com o tenant da
 * requisicao aplicado via set_config('app.tenant_id', ...), que as politicas
 * de Row-Level Security (prisma/migrations/*_rls_tenant_isolation) usam para
 * filtrar cada linha. Ver DEC-TEC-001 e ART-005, secao 8.
 *
 * Nunca consulte tabelas tenant-scoped diretamente por PrismaService fora
 * deste helper - isso ignoraria o contexto de tenant na aplicacao (a RLS no
 * banco continua protegendo, mas o filtro deve existir nas duas camadas,
 * conforme "defesa em profundidade" da skill seguranca-cibernetica-resiliencia).
 */
@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(tenantId: string, work: (tx: TenantScopedClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      return work(tx);
    });
  }
}
