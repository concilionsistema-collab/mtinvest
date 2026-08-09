import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

// EXTENSAO REGISTRADA: nao especificado em nenhum artefato - item basico de
// prontidao operacional (liveness/readiness) que praticamente toda
// plataforma de hospedagem (load balancer, orquestrador de container,
// monitoramento externo) exige, independente de qual for escolhida
// (DEC-TEC-002 continua em aberto). @Public(): quem chama isto e a propria
// infraestrutura, nunca um usuario com sessao. @SkipThrottle(): checagem de
// liveness roda a cada poucos segundos por definicao - contar isso contra o
// limite de 100 req/min por IP (app.module.ts) derrotaria o proposito.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @HttpCode(HttpStatus.OK)
  async verificar(): Promise<{ status: 'ok'; database: 'ok'; timestamp: string }> {
    try {
      // SELECT 1 nao toca tabela nenhuma tenant-scoped - nao precisa de
      // contexto de RLS (TenantPrismaService), so confirma que a conexao
      // com o Postgres esta de pe.
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
        timestamp: new Date().toISOString(),
      });
    }
    return { status: 'ok', database: 'ok', timestamp: new Date().toISOString() };
  }
}
