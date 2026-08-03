import { IsString } from 'class-validator';
import { CriarContratoDeAdministracaoInput } from '@crm/shared';

// Implementa US-101 (ART-015): "Cadastrar contrato de administração".
export class CriarContratoDeAdministracaoDto implements CriarContratoDeAdministracaoInput {
  @IsString()
  unidadeId!: string;

  @IsString()
  imovelId!: string;

  @IsString()
  proprietarioPessoaId!: string;
}
