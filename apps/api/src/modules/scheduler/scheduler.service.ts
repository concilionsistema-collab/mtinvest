import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { LeadsService } from '../leads/leads.service';
import { ReservasService } from '../reservas/reservas.service';
import { CarteirasService } from '../carteiras/carteiras.service';
import { VistoriasService } from '../locacao/vistorias.service';
import { ContratosLocacaoService } from '../locacao/contratos-locacao.service';

/**
 * README, "Próximos passos sugeridos": troca dos agendadores "preguiçosos"
 * (checagem embutida em listar()/capturar(), só roda quando alguém faz uma
 * requisição) por um job real, que varre todos os tenants ativos numa
 * cadência fixa, independente de tráfego. Reaproveita exatamente a mesma
 * lógica de negócio das checagens preguiçosas (LeadsService/ReservasService/
 * CarteirasService.executarVarreduraAutomaticaTx) — não duplica regra, só
 * adiciona um segundo gatilho. As checagens preguiçosas continuam ativas
 * (consistência imediata em leitura); este job garante que a varredura
 * também acontece mesmo com zero tráfego.
 *
 * Como cada operação precisa do contexto RLS de um tenant por vez
 * (TenantPrismaService.run), o job primeiro enumera os tenants ATIVO — a
 * única leitura tenant-agnóstica desta classe, viabilizada pela política de
 * leitura em `tenant` (ver migration `rls_tenant_leitura_app`) — e roda a
 * varredura de cada um isoladamente, sem deixar a falha de um tenant
 * impedir os demais.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly leadsService: LeadsService,
    private readonly reservasService: ReservasService,
    private readonly carteirasService: CarteirasService,
    private readonly vistoriasService: VistoriasService,
    private readonly contratosLocacaoService: ContratosLocacaoService,
  ) {}

  // Cadência de 5 minutos - hipótese de trabalho (nenhum dos prazos que essa
  // varredura processa é medido em segundos: janela de exclusividade é 48h,
  // inatividade de lead é 180 dias, expiração de reserva é 5 dias, SLA de
  // carteira é 5 dias). Ajustável sem migração, é só uma constante de código.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async executarVarreduraAutomatica(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ATIVO' },
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        await this.tenantPrisma.run(tenant.id, async (tx) => {
          await this.leadsService.executarVarreduraAutomaticaTx(tx, tenant.id);
          await this.reservasService.executarVarreduraAutomaticaTx(tx, tenant.id);
          await this.carteirasService.executarVarreduraAutomaticaTx(tx, tenant.id);
          await this.vistoriasService.executarVarreduraAutomaticaTx(tx, tenant.id);
          await this.contratosLocacaoService.executarVarreduraAutomaticaTx(tx, tenant.id);
        });
      } catch (erro) {
        // Um tenant com falha (ex.: dado inconsistente) nao pode travar a
        // varredura dos demais - registra e segue.
        this.logger.error(
          `Falha na varredura automática do tenant ${tenant.id}`,
          erro instanceof Error ? erro.stack : String(erro),
        );
      }
    }
  }
}
