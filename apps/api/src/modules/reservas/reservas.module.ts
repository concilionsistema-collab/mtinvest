import { Module } from '@nestjs/common';
import { OportunidadesModule } from '../oportunidades/oportunidades.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';

@Module({
  imports: [OportunidadesModule, AuditoriaModule],
  controllers: [ReservasController],
  providers: [ReservasService],
  exports: [ReservasService],
})
export class ReservasModule {}
