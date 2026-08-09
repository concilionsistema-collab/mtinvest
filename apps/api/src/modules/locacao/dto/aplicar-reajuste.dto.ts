import { IsNumber, Matches } from 'class-validator';
import { AplicarReajusteInput } from '@crm/shared';

export class AplicarReajusteDto implements AplicarReajusteInput {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'competencia deve estar no formato AAAA-MM' })
  competencia!: string;

  @IsNumber()
  percentualIndice!: number;
}
