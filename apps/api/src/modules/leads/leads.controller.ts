import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CapturarLeadResultado, InteracaoDeLead, Lead } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { CapturarLeadDto } from './dto/capturar-lead.dto';
import { RegistrarInteracaoDto } from './dto/registrar-interacao.dto';
import { LeadsService } from './leads.service';

// Implementa US-007, US-008 e US-009 (ART-014, EPIC-03 - Leads).
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  capturar(
    @CurrentTenant() tenantId: string,
    @Body() dto: CapturarLeadDto,
  ): Promise<CapturarLeadResultado> {
    return this.leadsService.capturar(tenantId, dto);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
  ): Promise<Lead[]> {
    return this.leadsService.listar(tenantId, chamador.unidadeId);
  }

  @Post(':id/interacoes')
  registrarInteracao(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: RegistrarInteracaoDto,
  ): Promise<InteracaoDeLead> {
    return this.leadsService.registrarInteracao(tenantId, id, dto, ator.id);
  }
}
