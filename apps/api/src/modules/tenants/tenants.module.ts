import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, AuditoriaModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
