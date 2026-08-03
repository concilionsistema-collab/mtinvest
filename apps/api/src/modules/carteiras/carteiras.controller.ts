import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TransferenciaDeCarteira } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { DecidirTransferenciaDto } from './dto/decidir-transferencia.dto';
import { CarteirasService } from './carteiras.service';

// Implementa US-010, CA-002 (ART-014, EPIC-03 - Leads).
@Controller('carteiras/transferencias')
export class CarteirasController {
  constructor(private readonly carteirasService: CarteirasService) {}

  @Get()
  listarPendentes(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
  ): Promise<TransferenciaDeCarteira[]> {
    return this.carteirasService.listarPendentes(tenantId, chamador);
  }

  @Post(':id/decidir')
  decidir(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: DecidirTransferenciaDto,
  ): Promise<TransferenciaDeCarteira> {
    return this.carteirasService.decidir(tenantId, id, dto.destinoUsuarioId, chamador);
  }
}
