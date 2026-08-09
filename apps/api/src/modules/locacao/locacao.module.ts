import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ContratosAdministracaoController } from './contratos-administracao.controller';
import { ContratosAdministracaoService } from './contratos-administracao.service';
import { ContratosLocacaoController } from './contratos-locacao.controller';
import { ContratosLocacaoService } from './contratos-locacao.service';
import { GarantiasController } from './garantias.controller';
import { GarantiasService } from './garantias.service';
import { VistoriasController } from './vistorias.controller';
import { VistoriasService } from './vistorias.service';
import { ReajustesController } from './reajustes.controller';
import { ReajustesService } from './reajustes.service';
import { RenovacoesController } from './renovacoes.controller';
import { RenovacoesService } from './renovacoes.service';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';
import { PortalAcessosController } from './portal-acessos.controller';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { EncerramentoAntecipadoController } from './encerramento-antecipado.controller';
import { EncerramentoAntecipadoService } from './encerramento-antecipado.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [
    ContratosAdministracaoController,
    ContratosLocacaoController,
    GarantiasController,
    VistoriasController,
    ReajustesController,
    RenovacoesController,
    DocumentosController,
    PortalAcessosController,
    PortalController,
    EncerramentoAntecipadoController,
  ],
  providers: [
    ContratosAdministracaoService,
    ContratosLocacaoService,
    GarantiasService,
    VistoriasService,
    ReajustesService,
    RenovacoesService,
    DocumentosService,
    PortalService,
    EncerramentoAntecipadoService,
  ],
  exports: [VistoriasService, ContratosLocacaoService],
})
export class LocacaoModule {}
