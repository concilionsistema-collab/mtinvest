import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { CriarUnidadeInput } from '@crm/shared';

// Implementa US-001 (ART-014): "Cadastrar unidade dentro do tenant".
export class CriarUnidadeDto implements CriarUnidadeInput {
  @IsString()
  @MinLength(2)
  nomeFantasia!: string;

  @IsOptional()
  @IsBoolean()
  eMatriz?: boolean;
}
