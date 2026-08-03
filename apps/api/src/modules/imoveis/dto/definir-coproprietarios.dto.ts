import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsPositive, IsString, Max, ValidateNested } from 'class-validator';
import { DefinirCoproprietariosInput, DefinirCoproprietariosItem } from '@crm/shared';

class CoproprietarioItemDto implements DefinirCoproprietariosItem {
  @IsString()
  pessoaId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100)
  percentual!: number;
}

// Implementa US-006 (ART-014): "Registrar coproprietários de um imóvel com percentuais vigentes".
export class DefinirCoproprietariosDto implements DefinirCoproprietariosInput {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CoproprietarioItemDto)
  coproprietarios!: CoproprietarioItemDto[];
}
