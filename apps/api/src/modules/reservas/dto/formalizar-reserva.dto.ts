import { IsString } from 'class-validator';
import { FormalizarReservaInput } from '@crm/shared';

// Implementa US-018 (ART-014): "Formalizar reserva do imóvel".
export class FormalizarReservaDto implements FormalizarReservaInput {
  @IsString()
  propostaId!: string;
}
