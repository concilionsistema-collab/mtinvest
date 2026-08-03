import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Reserva } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { FormalizarReservaDto } from './dto/formalizar-reserva.dto';
import { ReservasService } from './reservas.service';

// Implementa US-018 (ART-014, EPIC-06 - Proposta, contraproposta e reserva).
@Controller('oportunidades/:oportunidadeId/reservas')
export class ReservasController {
  constructor(private readonly reservasService: ReservasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  formalizar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('oportunidadeId') oportunidadeId: string,
    @Body() dto: FormalizarReservaDto,
  ): Promise<Reserva> {
    return this.reservasService.formalizar(tenantId, oportunidadeId, dto, ator.id);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Param('oportunidadeId') oportunidadeId: string,
  ): Promise<Reserva[]> {
    return this.reservasService.listarPorOportunidade(tenantId, oportunidadeId, chamador.unidadeId);
  }
}
