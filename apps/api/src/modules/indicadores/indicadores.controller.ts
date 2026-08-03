import { Controller, Get, Query } from '@nestjs/common';
import { IndicadoresFunil } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { IndicadoresService } from './indicadores.service';

// Implementa US-024 (ART-014, EPIC-11 - Indicadores básicos).
@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly indicadoresService: IndicadoresService) {}

  @Get()
  obter(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Query('unidadeId') unidadeId?: string,
  ): Promise<IndicadoresFunil> {
    return this.indicadoresService.obter(tenantId, chamador, unidadeId);
  }
}
