import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Reajuste } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AplicarReajusteDto } from './dto/aplicar-reajuste.dto';
import { ReajustesService } from './reajustes.service';

// Implementa US-108 (ART-015-backlog-fase-2.md) / RN-406, RN-407 (ART-010).
@Controller('locacao/contratos')
export class ReajustesController {
  constructor(private readonly reajustesService: ReajustesService) {}

  @Post(':contratoId/reajustes')
  @HttpCode(HttpStatus.CREATED)
  aplicar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
    @Body() dto: AplicarReajusteDto,
  ): Promise<Reajuste> {
    return this.reajustesService.aplicar(tenantId, ator, contratoId, dto);
  }

  @Get(':contratoId/reajustes')
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
  ): Promise<Reajuste[]> {
    return this.reajustesService.listar(tenantId, ator.unidadeId, contratoId);
  }
}
