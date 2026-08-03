import { Controller, Get, Body, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Usuario } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { UsuariosService } from './usuarios.service';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() concedente: UsuarioAutenticado,
    @Body() dto: CriarUsuarioDto,
  ): Promise<Usuario> {
    return this.usuariosService.criar(tenantId, concedente, dto);
  }

  @Get()
  listar(@CurrentTenant() tenantId: string): Promise<Usuario[]> {
    return this.usuariosService.listar(tenantId);
  }

  // Base da tela "Configurações". Precisa vir antes de ':id/desligar' na
  // leitura do arquivo só por organização - Nest resolve por método+padrão
  // exato, 'me' aqui não colide com ':id' porque são paths distintos.
  @Get('me')
  obterPerfil(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
  ): Promise<Usuario> {
    return this.usuariosService.obterPerfil(tenantId, chamador.id);
  }

  @Patch('me/senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  alterarSenha(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Body() dto: AlterarSenhaDto,
  ): Promise<void> {
    return this.usuariosService.alterarSenha(tenantId, chamador.id, dto);
  }

  // Implementa US-010 (ART-014): "Transferir carteira de corretor desligado/afastado".
  // PENDENCIA REGISTRADA (US-003, "Permissões: ação restrita a Administrador
  // da rede/RH integrado"): este sistema só distingue GESTOR_UNIDADE e
  // CORRETOR (ver UsuarioPerfil) - não existe ainda um perfil "Administrador
  // da rede" para restringir este endpoint com precisão; qualquer usuário
  // autenticado do tenant pode desligar hoje. Revisar quando/se um perfil
  // administrativo de rede for modelado.
  @Post(':id/desligar')
  desligar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Usuario> {
    return this.usuariosService.desligar(tenantId, id, ator.id);
  }
}
