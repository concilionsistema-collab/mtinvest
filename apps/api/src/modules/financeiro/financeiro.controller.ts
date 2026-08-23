import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { LancamentoFinanceiro, ResumoLancamentosFinanceiros } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AtualizarLancamentoFinanceiroDto } from './dto/atualizar-lancamento-financeiro.dto';
import { CancelarLancamentoFinanceiroDto } from './dto/cancelar-lancamento-financeiro.dto';
import { CriarLancamentoFinanceiroDto } from './dto/criar-lancamento-financeiro.dto';
import { FinanceiroService } from './financeiro.service';

@Controller('lancamentos-financeiros')
export class FinanceiroController {
  constructor(private readonly financeiroService: FinanceiroService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Body() dto: CriarLancamentoFinanceiroDto,
  ): Promise<LancamentoFinanceiro> {
    return this.financeiroService.criar(tenantId, ator, dto);
  }

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
  ): Promise<LancamentoFinanceiro[]> {
    return this.financeiroService.listar(tenantId, ator);
  }

  // Declarado antes de ':id' de proposito - senao o Nest trataria 'resumo'
  // como valor de :id.
  @Get('resumo')
  resumo(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
  ): Promise<ResumoLancamentosFinanceiros> {
    return this.financeiroService.resumo(tenantId, ator);
  }

  @Patch(':id')
  atualizar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: AtualizarLancamentoFinanceiroDto,
  ): Promise<LancamentoFinanceiro> {
    return this.financeiroService.atualizar(tenantId, ator, id, dto);
  }

  @Patch(':id/liquidar')
  liquidar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<LancamentoFinanceiro> {
    return this.financeiroService.liquidar(tenantId, ator, id);
  }

  @Patch(':id/cancelar')
  cancelar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: CancelarLancamentoFinanceiroDto,
  ): Promise<LancamentoFinanceiro> {
    return this.financeiroService.cancelar(tenantId, ator, id, dto.motivo);
  }
}
