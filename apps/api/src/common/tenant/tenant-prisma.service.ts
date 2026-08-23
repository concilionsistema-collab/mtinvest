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

  // maxWait/timeout explicitos: o default do Prisma (maxWait 2s, timeout 5s)
  // e pensado pra um pool de conexao generoso - sob o pool_size=15 (limite
  // do plano atual do Supabase) e varias invocacoes serverless concorrentes
  // disputando conexao ao mesmo tempo (ex.: uma tela que dispara varias
  // chamadas em paralelo, como /equipe), 2s pra CONSEGUIR uma conexao e
  // curto demais e estoura com "Unable to start a transaction in the given
  // time" mesmo quando a consulta em si e trivial - o gargalo e esperar a
  // conexao vagar, nao a query rodar. maxWait maior da mais fila pra
  // esperar sem falhar; timeout maior e so headroom de seguranca (as
  // consultas reais daqui sao rapidas - dado pequeno, sem query pesada).
  async run<T>(tenantId: string, work: (tx: TenantScopedClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
        return work(tx);
      },
      { maxWait: 15_000, timeout: 15_000 },
    );
  }
}
