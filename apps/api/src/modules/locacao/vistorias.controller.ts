import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ContestacaoDeVistoria, Vistoria } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AgendarVistoriaDto } from './dto/agendar-vistoria.dto';
import { RealizarLaudoVistoriaDto } from './dto/realizar-laudo-vistoria.dto';
import { RegistrarContestacaoDto } from './dto/registrar-contestacao.dto';
import { DecidirContestacaoDto } from './dto/decidir-contestacao.dto';
import { VistoriasService } from './vistorias.service';

// Implementa US-106/US-107 (ART-015-backlog-fase-2.md) / RN-404, RN-405 (ART-010).
@Controller('locacao/vistorias')
export class VistoriasController {
  constructor(private readonly vistoriasService: VistoriasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  agendar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Body() dto: AgendarVistoriaDto,
  ): Promise<Vistoria> {
    return this.vistoriasService.agendar(tenantId, ator.id, ator.unidadeId, dto);
  }

  @Post(':id/laudo')
  realizarLaudo(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: RealizarLaudoVistoriaDto,
  ): Promise<Vistoria> {
    return this.vistoriasService.realizarLaudo(tenantId, ator, id, dto);
  }

  @Post(':id/contestacao')
  @HttpCode(HttpStatus.CREATED)
  registrarContestacao(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: RegistrarContestacaoDto,
  ): Promise<ContestacaoDeVistoria> {
    return this.vistoriasService.registrarContestacao(tenantId, ator.id, ator.unidadeId, id, dto);
  }

  @Post(':id/contestacao/decisao')
  decidirContestacao(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: DecidirContestacaoDto,
  ): Promise<ContestacaoDeVistoria> {
    return this.vistoriasService.decidirContestacao(tenantId, ator, id, dto);
  }

  @Get(':id/contestacao')
  listarContestacoes(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<ContestacaoDeVistoria[]> {
    return this.vistoriasService.listarContestacoes(tenantId, ator.unidadeId, id);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Query('contratoDeLocacaoId') contratoDeLocacaoId: string,
  ): Promise<Vistoria[]> {
    return this.vistoriasService.listar(tenantId, ator.unidadeId, contratoDeLocacaoId);
  }
}
