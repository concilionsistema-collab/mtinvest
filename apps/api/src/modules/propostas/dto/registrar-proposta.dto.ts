import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';
import { RegistrarPropostaInput } from '@crm/shared';

// Implementa US-016 (ART-014): "Registrar proposta formal".
export class RegistrarPropostaDto implements RegistrarPropostaInput {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor!: number;

  @IsString()
  @MinLength(3)
  condicoes!: string;
}
