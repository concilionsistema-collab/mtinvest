import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Pessoa } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AtualizarPessoaDto } from './dto/atualizar-pessoa.dto';
import { CriarPessoaDto } from './dto/criar-pessoa.dto';
import { SolicitarEliminacaoDto } from './dto/solicitar-eliminacao.dto';
import { PessoasService } from './pessoas.service';

@Controller('pessoas')
export class PessoasController {
  constructor(private readonly pessoasService: PessoasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(@CurrentTenant() tenantId: string, @Body() dto: CriarPessoaDto): Promise<Pessoa> {
    return this.pessoasService.criar(tenantId, dto);
  }

  @Get()
  listar(@CurrentTenant() tenantId: string): Promise<Pessoa[]> {
    return this.pessoasService.listar(tenantId);
  }

  // ART-012 (LGPD): "direito de correção".
  @Patch(':id')
  atualizar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: AtualizarPessoaDto,
  ): Promise<Pessoa> {
    return this.pessoasService.atualizar(tenantId, ator.id, id, dto);
  }

  // ART-012 (LGPD): "processo de atendimento a pedido de eliminação" - ação
  // irreversível, restrita a GESTOR_UNIDADE (mesmo padrão de outras ações
  // sensíveis desta base, ex. registrar laudo de vistoria).
  @Post(':id/eliminacao')
  solicitarEliminacao(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
    @Body() dto: SolicitarEliminacaoDto,
  ): Promise<Pessoa> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode processar um pedido de eliminação de titular (ART-012).');
    }
    return this.pessoasService.solicitarEliminacao(tenantId, ator.id, id, dto.motivo);
  }
}
