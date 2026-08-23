import { IsString, MinLength } from 'class-validator';
import { CancelarLancamentoFinanceiroInput } from '@crm/shared';

export class CancelarLancamentoFinanceiroDto implements CancelarLancamentoFinanceiroInput {
  @IsString()
  @MinLength(3)
  motivo!: string;
}
