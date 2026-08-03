import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ContratoDeLocacao } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { CriarContratoDeLocacaoDto } from './dto/criar-contrato-locacao.dto';
import { ContratosLocacaoService } from './contratos-locacao.service';

// Implementa US-102 (ART-015-backlog-fase-2.md) / RN-401 (ART-010).
@Controller('locacao/contratos')
export class ContratosLocacaoController {
  constructor(private readonly contratosLocacaoService: ContratosLocacaoService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Body() dto: CriarContratoDeLocacaoDto,
  ): Promise<ContratoDeLocacao> {
    return this.contratosLocacaoService.criar(tenantId, ator.id, dto);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
  ): Promise<ContratoDeLocacao[]> {
    return this.contratosLocacaoService.listar(tenantId, chamador.unidadeId);
  }
}
