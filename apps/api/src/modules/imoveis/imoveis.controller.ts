import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Imovel, ImovelCoproprietario } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { CompartilharImovelDto } from './dto/compartilhar-imovel.dto';
import { CriarImovelDto } from './dto/criar-imovel.dto';
import { DefinirCoproprietariosDto } from './dto/definir-coproprietarios.dto';
import { ImoveisService } from './imoveis.service';

// Implementa US-004, US-005 e US-006 (ART-014, EPIC-02 - Imoveis).
@Controller('imoveis')
export class ImoveisController {
  constructor(private readonly imoveisService: ImoveisService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(@CurrentTenant() tenantId: string, @Body() dto: CriarImovelDto): Promise<Imovel> {
    return this.imoveisService.criar(tenantId, dto);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
  ): Promise<Imovel[]> {
    return this.imoveisService.listar(tenantId, chamador.unidadeId);
  }

  @Post(':id/compartilhamento')
  compartilhar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: CompartilharImovelDto,
  ): Promise<Imovel> {
    return this.imoveisService.compartilhar(tenantId, id, dto, ator.id);
  }

  @Post(':id/compartilhamento/revogar')
  revogarCompartilhamento(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Imovel> {
    return this.imoveisService.revogarCompartilhamento(tenantId, id, ator.id);
  }

  @Post(':id/coproprietarios')
  definirCoproprietarios(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: DefinirCoproprietariosDto,
  ): Promise<ImovelCoproprietario[]> {
    return this.imoveisService.definirCoproprietarios(tenantId, id, dto);
  }

  @Get(':id/coproprietarios')
  listarCoproprietarios(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<ImovelCoproprietario[]> {
    return this.imoveisService.listarCoproprietariosVigentes(tenantId, id);
  }
}
