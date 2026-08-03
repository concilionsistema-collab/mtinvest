import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { RadarController } from './radar.controller';
import { RadarService } from './radar.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [RadarController],
  providers: [RadarService],
})
export class RadarModule {}
