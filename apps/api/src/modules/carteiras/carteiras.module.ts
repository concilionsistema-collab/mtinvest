import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CarteirasController } from './carteiras.controller';
import { CarteirasService } from './carteiras.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CarteirasController],
  providers: [CarteirasService],
  exports: [CarteirasService],
})
export class CarteirasModule {}
