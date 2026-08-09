import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { SolicitarEncerramentoAntecipadoInput } from '@crm/shared';

export class SolicitarEncerramentoAntecipadoDto implements SolicitarEncerramentoAntecipadoInput {
  @IsOptional()
  @IsBoolean()
  isento?: boolean;

  // RN-410: apuracao formal, obrigatoria quando isento=true - checado de
  // novo no service (nao confia so na validacao de entrada).
  @IsOptional()
  @IsString()
  @MinLength(3)
  motivoIsencao?: string;
}
