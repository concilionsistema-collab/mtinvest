import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ContratoDeAdministracao } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { CriarContratoDeAdministracaoDto } from './dto/criar-contrato-administracao.dto';
import { ContratosAdministracaoService } from './contratos-administracao.service';

// Implementa US-101 (ART-015-backlog-fase-2.md).
@Controller('locacao/administracao-contratos')
export class ContratosAdministracaoController {
  constructor(private readonly contratosAdministracaoService: ContratosAdministracaoService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Body() dto: CriarContratoDeAdministracaoDto,
  ): Promise<ContratoDeAdministracao> {
    return this.contratosAdministracaoService.criar(tenantId, ator.id, dto);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
  ): Promise<ContratoDeAdministracao[]> {
    return this.contratosAdministracaoService.listar(tenantId, chamador.unidadeId);
  }
}
