import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Garantia } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { RegistrarGarantiaDto } from './dto/registrar-garantia.dto';
import { GarantiasService } from './garantias.service';

// Implementa US-104/US-105 (ART-015-backlog-fase-2.md) / RN-402, RN-403 (ART-010).
@Controller('locacao')
export class GarantiasController {
  constructor(private readonly garantiasService: GarantiasService) {}

  @Post('contratos/:contratoId/garantias')
  @HttpCode(HttpStatus.CREATED)
  registrar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
    @Body() dto: RegistrarGarantiaDto,
  ): Promise<Garantia> {
    return this.garantiasService.registrar(tenantId, ator.id, ator.unidadeId, contratoId, dto);
  }

  @Get('contratos/:contratoId/garantias')
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
  ): Promise<Garantia[]> {
    return this.garantiasService.listar(tenantId, ator.unidadeId, contratoId);
  }

  @Post('contratos/:contratoId/garantias/troca')
  @HttpCode(HttpStatus.CREATED)
  trocar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
    @Body() dto: RegistrarGarantiaDto,
  ): Promise<Garantia> {
    return this.garantiasService.trocar(tenantId, ator.id, ator.unidadeId, contratoId, dto);
  }

  @Post('garantias/:id/ativar')
  ativar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Garantia> {
    return this.garantiasService.ativar(tenantId, ator.id, ator.unidadeId, id);
  }
}
