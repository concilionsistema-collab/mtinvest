import { Module } from '@nestjs/common';
import { ChecklistModule } from '../checklist/checklist.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { OportunidadesController } from './oportunidades.controller';
import { OportunidadesService } from './oportunidades.service';

@Module({
  imports: [ChecklistModule, AuditoriaModule],
  controllers: [OportunidadesController],
  providers: [OportunidadesService],
  exports: [OportunidadesService],
})
export class OportunidadesModule {}
