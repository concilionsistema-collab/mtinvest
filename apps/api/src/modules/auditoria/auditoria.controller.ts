import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { RegistroDeAuditoria } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from './auditoria.service';

// Consulta da trilha de auditoria (ART-005, RegistroDeAuditoria). Restrito a
// GESTOR_UNIDADE - mesma decisao ja tomada para /indicadores (IndicadoresService):
// ART-006 reservaria isto ao perfil Auditor/Gestor, que nao existe nesta fatia
// alem de GESTOR_UNIDADE, entao e o unico autorizado por ora.
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Query('entidadeTipo') entidadeTipo?: string,
    @Query('entidadeId') entidadeId?: string,
  ): Promise<RegistroDeAuditoria[]> {
    if (chamador.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Apenas Gestor de unidade pode consultar a trilha de auditoria.');
    }
    return this.auditoriaService.listar(tenantId, entidadeTipo, entidadeId);
  }
}
