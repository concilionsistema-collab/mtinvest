import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Proposta } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { RegistrarContrapropostaDto } from './dto/registrar-contraproposta.dto';
import { RegistrarPropostaDto } from './dto/registrar-proposta.dto';
import { PropostasService } from './propostas.service';

// Implementa US-016 e US-017 (ART-014, EPIC-06 - Proposta, contraproposta e reserva).
@Controller('oportunidades/:oportunidadeId/propostas')
export class PropostasController {
  constructor(private readonly propostasService: PropostasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  registrar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('oportunidadeId') oportunidadeId: string,
    @Body() dto: RegistrarPropostaDto,
  ): Promise<Proposta> {
    return this.propostasService.registrar(tenantId, oportunidadeId, dto, ator.id);
  }

  @Post('contraproposta')
  @HttpCode(HttpStatus.CREATED)
  contrapropor(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('oportunidadeId') oportunidadeId: string,
    @Body() dto: RegistrarContrapropostaDto,
  ): Promise<Proposta> {
    return this.propostasService.contrapropor(tenantId, oportunidadeId, dto, ator.id);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Param('oportunidadeId') oportunidadeId: string,
  ): Promise<Proposta[]> {
    return this.propostasService.listarPorOportunidade(tenantId, oportunidadeId, chamador.unidadeId);
  }
}

@Controller('propostas')
export class PropostasAcoesController {
  constructor(private readonly propostasService: PropostasService) {}

  @Get()
  listarTodas(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
  ): Promise<Proposta[]> {
    return this.propostasService.listarTodas(tenantId, chamador.unidadeId);
  }

  @Post(':id/aceitar')
  aceitar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Proposta> {
    return this.propostasService.aceitar(tenantId, id, ator.id);
  }
}
