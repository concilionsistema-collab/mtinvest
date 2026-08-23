import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { AtualizarLancamentoFinanceiroInput, LancamentoFinanceiroCategoria } from '@crm/shared';

const CATEGORIAS: LancamentoFinanceiroCategoria[] = [
  'COMISSAO',
  'ALUGUEL',
  'REPASSE_PROPRIETARIO',
  'TAXA_ADMINISTRACAO',
  'DESPESA_OPERACIONAL',
  'OUTRO',
];

export class AtualizarLancamentoFinanceiroDto implements AtualizarLancamentoFinanceiroInput {
  @IsOptional()
  @IsIn(CATEGORIAS)
  categoria?: LancamentoFinanceiroCategoria;

  @IsOptional()
  @IsString()
  @MinLength(2)
  descricao?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor?: number;

  @IsOptional()
  @IsDateString()
  vencimento?: string;

  @IsOptional()
  @IsString()
  contraparte?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
