import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Visita } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AgendarVisitaDto } from './dto/agendar-visita.dto';
import { RealizarVisitaDto } from './dto/realizar-visita.dto';
import { VisitasService } from './visitas.service';

// Implementa US-014 e US-015 (ART-014, EPIC-05 - Agenda e visitas).
@Controller('visitas')
export class VisitasController {
  constructor(private readonly visitasService: VisitasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  agendar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Body() dto: AgendarVisitaDto,
  ): Promise<Visita> {
    return this.visitasService.agendar(tenantId, dto, ator.id);
  }

  // Sem oportunidadeId na query: lista todas as visitas da unidade (tela "Visitas").
  // Com oportunidadeId: mantem o comportamento existente, escopado aquela oportunidade.
  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Query('oportunidadeId') oportunidadeId?: string,
  ): Promise<Visita[]> {
    return oportunidadeId
      ? this.visitasService.listarPorOportunidade(tenantId, oportunidadeId, chamador.unidadeId)
      : this.visitasService.listarTodas(tenantId, chamador.unidadeId);
  }

  @Post(':id/confirmar')
  confirmar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Visita> {
    return this.visitasService.confirmar(tenantId, id, ator.id);
  }

  @Post(':id/cancelar')
  cancelar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Visita> {
    return this.visitasService.cancelar(tenantId, id, ator.id);
  }

  @Post(':id/realizar')
  realizar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: RealizarVisitaDto,
  ): Promise<Visita> {
    return this.visitasService.realizar(tenantId, id, dto, ator.id);
  }
}
