import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Unidade } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CriarUnidadeDto } from './dto/criar-unidade.dto';
import { CriarUnidadeResultado, UnidadesService } from './unidades.service';

// Implementa US-001 (ART-014, EPIC-01 - Identidade e fundacao).
@Controller('unidades')
export class UnidadesController {
  constructor(private readonly unidadesService: UnidadesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(
    @CurrentTenant() tenantId: string,
    @Body() dto: CriarUnidadeDto,
  ): Promise<CriarUnidadeResultado> {
    return this.unidadesService.criar(tenantId, dto);
  }

  @Get()
  listar(@CurrentTenant() tenantId: string): Promise<Unidade[]> {
    return this.unidadesService.listar(tenantId);
  }
}
