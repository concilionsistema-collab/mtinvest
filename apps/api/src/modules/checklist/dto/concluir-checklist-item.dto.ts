import { IsBoolean } from 'class-validator';
import { ConcluirChecklistItemInput } from '@crm/shared';

export class ConcluirChecklistItemDto implements ConcluirChecklistItemInput {
  @IsBoolean()
  concluido!: boolean;
}
