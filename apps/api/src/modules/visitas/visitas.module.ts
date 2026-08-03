import { Module } from '@nestjs/common';
import { OportunidadesModule } from '../oportunidades/oportunidades.module';
import { VisitasController } from './visitas.controller';
import { VisitasService } from './visitas.service';

@Module({
  imports: [OportunidadesModule],
  controllers: [VisitasController],
  providers: [VisitasService],
})
export class VisitasModule {}
