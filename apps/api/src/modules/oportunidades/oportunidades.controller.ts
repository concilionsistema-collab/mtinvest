import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ComissaoCruzadaAcionada, Oportunidade } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { CriarOportunidadeDto } from './dto/criar-oportunidade.dto';
import { MoverOportunidadeDto } from './dto/mover-oportunidade.dto';
import { OportunidadesService } from './oportunidades.service';

// Implementa US-011, US-012 e US-013 (ART-014, EPIC-04 - Funil de oportunidades).
@Controller('oportunidades')
export class OportunidadesController {
  constructor(private readonly oportunidadesService: OportunidadesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Body() dto: CriarOportunidadeDto,
  ): Promise<Oportunidade> {
    return this.oportunidadesService.criar(tenantId, dto, ator.id);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
  ): Promise<Oportunidade[]> {
    return this.oportunidadesService.listar(tenantId, chamador.unidadeId);
  }

  @Post(':id/mover')
  mover(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: MoverOportunidadeDto,
  ): Promise<Oportunidade> {
    return this.oportunidadesService.moverEstagio(tenantId, id, dto.estadoDestino, ator.id);
  }

  @Post(':id/tentativas-contato')
  registrarTentativa(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<{ tentativasRegistradas: number }> {
    return this.oportunidadesService.registrarTentativaDeContato(tenantId, id, ator.id);
  }

  @Post(':id/fechar')
  fechar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Oportunidade> {
    return this.oportunidadesService.fechar(tenantId, id, ator.id);
  }

  @Get(':id/comissao-cruzada')
  listarComissoesCruzadas(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<ComissaoCruzadaAcionada[]> {
    return this.oportunidadesService.listarComissoesCruzadas(tenantId, id);
  }
}
