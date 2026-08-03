import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [LeadsModule, AuditoriaModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
