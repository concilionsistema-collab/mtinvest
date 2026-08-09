import { IsOptional, IsString, MinLength } from 'class-validator';
import { AtualizarPessoaInput } from '@crm/shared';

// Implementa ART-012 (LGPD): "direito de correção".
export class AtualizarPessoaDto implements AtualizarPessoaInput {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsString()
  documentoNormalizado?: string;

  @IsOptional()
  @IsString()
  telefoneNormalizado?: string;
}
