import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { ReservasModule } from '../reservas/reservas.module';
import { CarteirasModule } from '../carteiras/carteiras.module';
import { LocacaoModule } from '../locacao/locacao.module';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [LeadsModule, ReservasModule, CarteirasModule, LocacaoModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
