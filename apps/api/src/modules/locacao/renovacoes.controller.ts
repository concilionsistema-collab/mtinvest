import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Renovacao } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { ConfirmarRenovacaoDto } from './dto/confirmar-renovacao.dto';
import { RenovacoesService } from './renovacoes.service';

// Implementa US-109 (ART-015-backlog-fase-2.md) / RN-408, RN-412 (ART-010).
@Controller('locacao/contratos')
export class RenovacoesController {
  constructor(private readonly renovacoesService: RenovacoesService) {}

  @Post(':contratoId/renovacao')
  @HttpCode(HttpStatus.CREATED)
  confirmar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
    @Body() dto: ConfirmarRenovacaoDto,
  ): Promise<Renovacao> {
    return this.renovacoesService.confirmar(tenantId, ator, contratoId, dto);
  }

  @Get(':contratoId/renovacoes')
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
  ): Promise<Renovacao[]> {
    return this.renovacoesService.listar(tenantId, ator.unidadeId, contratoId);
  }
}
