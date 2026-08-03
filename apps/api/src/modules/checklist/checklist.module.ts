import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ChecklistController } from './checklist.controller';
import { ChecklistService } from './checklist.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [ChecklistController],
  providers: [ChecklistService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
