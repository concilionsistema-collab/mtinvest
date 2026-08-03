import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ImoveisController } from './imoveis.controller';
import { ImoveisService } from './imoveis.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [ImoveisController],
  providers: [ImoveisService],
})
export class ImoveisModule {}
