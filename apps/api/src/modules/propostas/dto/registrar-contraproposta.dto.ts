import { IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { RegistrarContrapropostaInput } from '@crm/shared';

// Implementa US-017 (ART-014): "Negociar contraproposta dentro da alçada pré-autorizada".
export class RegistrarContrapropostaDto implements RegistrarContrapropostaInput {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor!: number;

  @IsString()
  @MinLength(3)
  condicoes!: string;

  @IsOptional()
  @IsString()
  aprovadorUsuarioId?: string;
}
