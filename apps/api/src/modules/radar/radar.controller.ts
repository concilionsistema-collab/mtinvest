import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SugestaoImovel, SugestaoRadar } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { DecidirSugestaoDto } from './dto/decidir-sugestao.dto';
import { RadarService } from './radar.service';

// Implementa US-022 (ART-014, EPIC-09 - Busca e radar) / RN-316 (ART-009).
@Controller('leads/:leadId/sugestoes-imoveis')
export class RadarController {
  constructor(private readonly radarService: RadarService) {}

  @Get()
  sugerir(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('leadId') leadId: string,
  ): Promise<SugestaoImovel[]> {
    return this.radarService.sugerir(tenantId, leadId, ator.id);
  }

  @Post(':imovelId/decidir')
  decidir(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('leadId') leadId: string,
    @Param('imovelId') imovelId: string,
    @Body() dto: DecidirSugestaoDto,
  ): Promise<SugestaoRadar> {
    return this.radarService.decidir(tenantId, leadId, imovelId, ator.id, dto.status);
  }
}
