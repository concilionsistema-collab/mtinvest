import { Module } from '@nestjs/common';
import { OportunidadesModule } from '../oportunidades/oportunidades.module';
import { PropostasAcoesController, PropostasController } from './propostas.controller';
import { PropostasService } from './propostas.service';

@Module({
  imports: [OportunidadesModule],
  controllers: [PropostasController, PropostasAcoesController],
  providers: [PropostasService],
  exports: [PropostasService],
})
export class PropostasModule {}
