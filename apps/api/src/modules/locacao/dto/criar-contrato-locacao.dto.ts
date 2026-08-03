import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsPositive, IsString, Max, Min } from 'class-validator';
import { CriarContratoDeLocacaoInput, IndiceReajuste } from '@crm/shared';

const INDICES: IndiceReajuste[] = ['IGPM', 'IPCA', 'OUTRO'];

// Implementa US-102 (ART-015): "Cadastrar contrato de locação em Rascunho".
export class CriarContratoDeLocacaoDto implements CriarContratoDeLocacaoInput {
  @IsString()
  contratoDeAdministracaoId!: string;

  @IsString()
  inquilinoPessoaId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorAluguel!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento!: number;

  @IsIn(INDICES)
  indiceReajuste!: IndiceReajuste;

  // RN-407 (ART-010): declaração explícita, nunca assumida - por isso não é @IsOptional().
  @IsBoolean()
  aceitaReajusteNegativo!: boolean;

  @IsDateString()
  dataInicio!: string;

  @IsInt()
  @IsPositive()
  prazoMeses!: number;
}
