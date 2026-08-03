import { IsString, MinLength } from 'class-validator';
import { AlterarSenhaInput } from '@crm/shared';

export class AlterarSenhaDto implements AlterarSenhaInput {
  @IsString()
  senhaAtual!: string;

  @IsString()
  @MinLength(8)
  novaSenha!: string;
}
