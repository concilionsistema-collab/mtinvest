import { IsEmail, IsString, Matches, MinLength } from 'class-validator';
import { CriarTenantInput } from '@crm/shared';

// Slug curto (vira Tenant.id e o campo "Empresa" da tela de login, ver
// LoginInput.tenantId em auth.ts) - minusculas/numeros/hifen, para ficar
// digitavel e nao vazar nenhuma info do banco (ao contrario de um uuid cru).
const REGEX_SLUG = /^[a-z0-9][a-z0-9-]{2,48}$/;

export class CriarTenantDto implements CriarTenantInput {
  @IsString()
  @Matches(REGEX_SLUG, {
    message: 'Identificador deve ter de 3 a 49 caracteres: letras minúsculas, números e hífen, começando por letra ou número.',
  })
  tenantId!: string;

  @IsString()
  @MinLength(2)
  razaoSocial!: string;

  @IsString()
  @MinLength(2)
  nomeAdmin!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  senha!: string;
}
