import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ContratosAdministracaoController } from './contratos-administracao.controller';
import { ContratosAdministracaoService } from './contratos-administracao.service';
import { ContratosLocacaoController } from './contratos-locacao.controller';
import { ContratosLocacaoService } from './contratos-locacao.service';
import { GarantiasController } from './garantias.controller';
import { GarantiasService } from './garantias.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [ContratosAdministracaoController, ContratosLocacaoController, GarantiasController],
  providers: [ContratosAdministracaoService, ContratosLocacaoService, GarantiasService],
})
export class LocacaoModule {}
