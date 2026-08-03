import { IsString } from 'class-validator';
import { CriarOportunidadeInput } from '@crm/shared';

// Implementa US-012 (ART-014): "Criar oportunidade vinculando lead a imóvel específico".
export class CriarOportunidadeDto implements CriarOportunidadeInput {
  @IsString()
  leadId!: string;

  @IsString()
  imovelId!: string;
}
