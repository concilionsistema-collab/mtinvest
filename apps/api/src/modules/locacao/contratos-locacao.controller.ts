import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ContratoDeLocacao } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { CriarContratoDeLocacaoDto } from './dto/criar-contrato-locacao.dto';
import { ContratosLocacaoService } from './contratos-locacao.service';

// Implementa US-102/US-106 (ART-015-backlog-fase-2.md) / RN-401, RN-402, RN-404 (ART-010).
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

  // Endpoints de transição de estado não estão listados literalmente em
  // ART-010 §14 (que só lista garantia/vistoria/reajuste/renovação/
  // encerramento) - necessários para operar a máquina de estados de §8.1.
  @Post(':id/avancar-assinatura')
  avancarParaAssinatura(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<ContratoDeLocacao> {
    return this.contratosLocacaoService.avancarParaAssinatura(tenantId, ator.id, id);
  }

  @Post(':id/confirmar-assinatura')
  confirmarAssinatura(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<ContratoDeLocacao> {
    return this.contratosLocacaoService.confirmarAssinatura(tenantId, ator.id, id);
  }
}
