import { IsIn, IsNumber, IsOptional, IsPositive, IsString, Max, MinLength } from 'class-validator';
import { CriarImovelInput, ImovelFinalidade } from '@crm/shared';

const FINALIDADES: ImovelFinalidade[] = ['VENDA', 'LOCACAO', 'AMBOS'];

// Implementa US-004 (ART-014): "Captar um novo imóvel".
export class CriarImovelDto implements CriarImovelInput {
  @IsString()
  unidadeProprietariaId!: string;

  @IsIn(FINALIDADES)
  finalidade!: ImovelFinalidade;

  @IsString()
  @MinLength(5)
  enderecoResumo!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorAnunciado?: number;

  // DEC-NEG-013 (pendente): faixa de desconto pré-autorizada pelo proprietário.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100)
  percentualDescontoPreAutorizado?: number;
}
