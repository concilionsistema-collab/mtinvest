import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CriarPessoaInput, PessoaTipo } from '@crm/shared';

const TIPOS: PessoaTipo[] = ['FISICA', 'JURIDICA'];

export class CriarPessoaDto implements CriarPessoaInput {
  @IsIn(TIPOS)
  tipo!: PessoaTipo;

  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsString()
  documentoNormalizado?: string;
}
