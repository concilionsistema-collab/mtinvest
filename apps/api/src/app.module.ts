import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    // Ativa os decorators @Cron/@Interval em toda a aplicacao (SchedulerModule) -
    // sem isso, @Cron e so metadado, nunca dispara.
    ScheduleModule.forRoot(),
    // AuthModule registra o JwtAuthGuard como guard global (US-002/US-003) -
    // substitui o antigo TenantMiddleware. Precisa vir antes dos demais
    // apenas por legibilidade; a ordem de import nao afeta o registro do
    // guard global no Nest.
    AuthModule,
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
  ],
})
export class AppModule {}
