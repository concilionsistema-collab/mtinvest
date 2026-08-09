import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { EncerramentoAntecipado } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { SolicitarEncerramentoAntecipadoDto } from './dto/solicitar-encerramento-antecipado.dto';
import { EncerramentoAntecipadoService } from './encerramento-antecipado.service';

// Implementa US-111 (ART-015-backlog-fase-2.md) / RN-410, CA-405 (ART-010).
// BLOQUEADO PARA PRODUÇÃO REAL até validação jurídica formal - ver
// EncerramentoAntecipadoService.
@Controller('locacao/contratos')
export class EncerramentoAntecipadoController {
  constructor(private readonly encerramentoAntecipadoService: EncerramentoAntecipadoService) {}

  @Post(':contratoId/encerramento-antecipado')
  @HttpCode(HttpStatus.CREATED)
  solicitar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
    @Body() dto: SolicitarEncerramentoAntecipadoDto,
  ): Promise<EncerramentoAntecipado> {
    return this.encerramentoAntecipadoService.solicitar(tenantId, ator, contratoId, dto);
  }

  @Get(':contratoId/encerramento-antecipado')
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
  ): Promise<EncerramentoAntecipado[]> {
    return this.encerramentoAntecipadoService.listar(tenantId, ator.unidadeId, contratoId);
  }
}
