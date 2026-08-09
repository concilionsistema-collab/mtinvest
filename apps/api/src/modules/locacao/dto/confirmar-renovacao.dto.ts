import { IsInt, Min } from 'class-validator';
import { ConfirmarRenovacaoInput } from '@crm/shared';

export class ConfirmarRenovacaoDto implements ConfirmarRenovacaoInput {
  @IsInt()
  @Min(1)
  prazoAdicionalMeses!: number;
}
