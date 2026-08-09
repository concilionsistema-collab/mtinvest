import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { AcessoPortalContrato, GerarAcessoPortalResultado } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { GerarAcessoPortalDto } from './dto/gerar-acesso-portal.dto';
import { PortalService } from './portal.service';

// Lado "administrativo" de US-113 (gerar/revogar/listar acesso) - restrito a
// GESTOR_UNIDADE. O lado público (consulta pelo titular) é PortalController.
@Controller('locacao/contratos')
export class PortalAcessosController {
  constructor(private readonly portalService: PortalService) {}

  @Post(':contratoId/portal/acessos')
  @HttpCode(HttpStatus.CREATED)
  gerarAcesso(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
    @Body() dto: GerarAcessoPortalDto,
  ): Promise<GerarAcessoPortalResultado> {
    return this.portalService.gerarAcesso(tenantId, ator, contratoId, dto);
  }

  @Get(':contratoId/portal/acessos')
  listarAcessos(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
  ): Promise<AcessoPortalContrato[]> {
    return this.portalService.listarAcessos(tenantId, ator, contratoId);
  }

  @Post('portal/acessos/:acessoId/revogar')
  revogarAcesso(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('acessoId') acessoId: string,
  ): Promise<AcessoPortalContrato> {
    return this.portalService.revogarAcesso(tenantId, ator, acessoId);
  }
}
