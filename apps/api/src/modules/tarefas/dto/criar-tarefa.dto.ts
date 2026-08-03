import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
import { CriarTarefaInput } from '@crm/shared';

export class CriarTarefaDto implements CriarTarefaInput {
  @IsString()
  @MinLength(1)
  titulo!: string;

  @IsOptional()
  @IsISO8601()
  prazo?: string | null;
}
