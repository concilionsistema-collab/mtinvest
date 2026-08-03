import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { CapturarLeadInput, ImovelFinalidade } from '@crm/shared';

const FINALIDADES: ImovelFinalidade[] = ['VENDA', 'LOCACAO', 'AMBOS'];

// Implementa US-007 (ART-014): "Capturar lead de canal integrado com deduplicação automática".
export class CapturarLeadDto implements CapturarLeadInput {
  @IsString()
  unidadeId!: string;

  @IsString()
  @MinLength(2)
  nomeContato!: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  documento?: string;

  @IsString()
  @MinLength(2)
  origemCanal!: string;

  // EXTENSAO (US-022, radar) - preferencias opcionais, ver Lead em schema.prisma.
  @IsOptional()
  @IsIn(FINALIDADES)
  finalidadeDesejada?: ImovelFinalidade;

  @IsOptional()
  @IsNumber()
  @Min(0)
  orcamentoMinimo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  orcamentoMaximo?: number;
}
