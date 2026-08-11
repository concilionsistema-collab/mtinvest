import {
  Controller,
  Get,
  Body,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Usuario } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { UsuariosService } from './usuarios.service';

// Sem @types/multer no projeto (nao ha necessidade de nenhum outro tipo de
// Express.Multer.File) - forma minima do que os handlers abaixo realmente
// usam, resolvida em runtime pelo FileInterceptor do @nestjs/platform-express.
interface ArquivoEnviado {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const TAMANHO_MAXIMO_FOTO_BYTES = 5 * 1024 * 1024;

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

  // Guardada no Postgres, nao em disco - ver comentario em schema.prisma
  // (Usuario.fotoPerfil). ParseFilePipe (built-in do Nest) valida tamanho e
  // tipo ANTES do controller rodar - preferido a um fileFilter do multer
  // porque o erro sai como uma BadRequestException normal do Nest (mesmo
  // formato de erro que qualquer outro endpoint), nao como um erro cru do
  // multer sem tratamento.
  @Post(':id/foto')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.NO_CONTENT)
  async uploadFoto(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: TAMANHO_MAXIMO_FOTO_BYTES }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: ArquivoEnviado,
  ): Promise<void> {
    await this.usuariosService.salvarFoto(tenantId, id, file.buffer, file.mimetype);
  }

  // Autenticado como qualquer outra rota (JwtAuthGuard e global) - por isso
  // o front-end NAO pode usar <img src="/usuarios/:id/foto"> diretamente (a
  // tag <img> nao envia o header Authorization); precisa buscar via
  // apiFetchBlob (lib/api.ts) e montar um object URL. Ver DEPLOY.md e
  // components equipe/page.tsx.
  @Get(':id/foto')
  async obterFoto(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const foto = await this.usuariosService.obterFoto(tenantId, id);
    if (!foto) {
      res.status(HttpStatus.NOT_FOUND).send();
      return;
    }
    res.setHeader('Content-Type', foto.contentType);
    // private: a foto e por usuario autenticado, nunca deve ser guardada em
    // cache compartilhado (proxy/CDN) de terceiros.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(foto.bytes);
  }
}
