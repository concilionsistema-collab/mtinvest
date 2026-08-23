import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import {
  CriarLancamentoFinanceiroInput,
  LancamentoFinanceiroCategoria,
  LancamentoFinanceiroTipo,
} from '@crm/shared';

const TIPOS: LancamentoFinanceiroTipo[] = ['A_PAGAR', 'A_RECEBER'];
const CATEGORIAS: LancamentoFinanceiroCategoria[] = [
  'COMISSAO',
  'ALUGUEL',
  'REPASSE_PROPRIETARIO',
  'TAXA_ADMINISTRACAO',
  'DESPESA_OPERACIONAL',
  'OUTRO',
];

export class CriarLancamentoFinanceiroDto implements CriarLancamentoFinanceiroInput {
  @IsIn(TIPOS)
  tipo!: LancamentoFinanceiroTipo;

  @IsIn(CATEGORIAS)
  categoria!: LancamentoFinanceiroCategoria;

  @IsString()
  @MinLength(2)
  descricao!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valor!: number;

  @IsDateString()
  vencimento!: string;

  @IsOptional()
  @IsString()
  contraparte?: string;

  @IsOptional()
  @IsString()
  pessoaId?: string;

  @IsOptional()
  @IsString()
  oportunidadeId?: string;

  @IsOptional()
  @IsString()
  contratoDeLocacaoId?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
