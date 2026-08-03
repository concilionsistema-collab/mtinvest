import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CriarUsuarioInput, UsuarioPerfil } from '@crm/shared';

const PERFIS: UsuarioPerfil[] = ['GESTOR_UNIDADE', 'CORRETOR'];

export class CriarUsuarioDto implements CriarUsuarioInput {
  @IsString()
  unidadeId!: string;

  @IsString()
  @MinLength(2)
  nome!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  senha!: string;

  @IsOptional()
  @IsIn(PERFIS)
  perfil?: UsuarioPerfil;
}
