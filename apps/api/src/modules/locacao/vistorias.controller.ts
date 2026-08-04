import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Vistoria } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AgendarVistoriaDto } from './dto/agendar-vistoria.dto';
import { RealizarLaudoVistoriaDto } from './dto/realizar-laudo-vistoria.dto';
import { VistoriasService } from './vistorias.service';

// Implementa US-106 (ART-015-backlog-fase-2.md) / RN-404 (ART-010).
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
    return this.vistoriasService.agendar(tenantId, ator.id, dto);
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

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @Query('contratoDeLocacaoId') contratoDeLocacaoId: string,
  ): Promise<Vistoria[]> {
    return this.vistoriasService.listar(tenantId, contratoDeLocacaoId);
  }
}
