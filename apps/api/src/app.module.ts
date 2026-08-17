import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantModule } from './common/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { UnidadesModule } from './modules/unidades/unidades.module';
import { ImoveisModule } from './modules/imoveis/imoveis.module';
import { PessoasModule } from './modules/pessoas/pessoas.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { LeadsModule } from './modules/leads/leads.module';
import { OportunidadesModule } from './modules/oportunidades/oportunidades.module';
import { VisitasModule } from './modules/visitas/visitas.module';
import { PropostasModule } from './modules/propostas/propostas.module';
import { ReservasModule } from './modules/reservas/reservas.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
import { RadarModule } from './modules/radar/radar.module';
import { IndicadoresModule } from './modules/indicadores/indicadores.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { CarteirasModule } from './modules/carteiras/carteiras.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { LocacaoModule } from './modules/locacao/locacao.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { HealthModule } from './modules/health/health.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    // Ativa os decorators @Cron/@Interval em toda a aplicacao (SchedulerModule) -
    // sem isso, @Cron e so metadado, nunca dispara.
    ScheduleModule.forRoot(),
    // Protecao volumetrica generica por IP em toda a API (100 req/min) -
    // fecha parte da pendencia "sem rate limiting" (README). Complementa,
    // nao substitui, o bloqueio por conta em LoginLockoutService
    // (AuthService) - throttling por IP so freia um unico IP martelando a
    // API; um ataque de forca bruta contra UMA conta especifica rodando de
    // varios IPs precisa do bloqueio por conta, que e a defesa de verdade
    // pra isso (ver auth.module.ts).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // AuthModule registra o JwtAuthGuard como guard global (US-002/US-003) -
    // substitui o antigo TenantMiddleware. Precisa vir antes dos demais
    // apenas por legibilidade; a ordem de import nao afeta o registro do
    // guard global no Nest.
    AuthModule,
    // TenantsModule (POST /tenants publico) e BillingModule (BillingGuard
    // global) vem logo depois de AuthModule de proposito: BillingGuard
    // depende de request.usuarioAutenticado, que so JwtAuthGuard (registrado
    // dentro de AuthModule) preenche - ver comentario em billing.guard.ts.
    TenantsModule,
    BillingModule,
    AuditoriaModule,
    UnidadesModule,
    ImoveisModule,
    PessoasModule,
    UsuariosModule,
    LeadsModule,
    ChecklistModule,
    OportunidadesModule,
    VisitasModule,
    PropostasModule,
    ReservasModule,
    RadarModule,
    IndicadoresModule,
    CarteirasModule,
    TarefasModule,
    LocacaoModule,
    SchedulerModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
