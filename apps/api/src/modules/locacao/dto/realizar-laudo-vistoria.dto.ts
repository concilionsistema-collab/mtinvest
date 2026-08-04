import { IsOptional, IsString, MinLength } from 'class-validator';
import { RealizarLaudoVistoriaInput } from '@crm/shared';

export class RealizarLaudoVistoriaDto implements RealizarLaudoVistoriaInput {
  @IsString()
  @MinLength(1)
  laudo!: string;

  @IsOptional()
  @IsString()
  evidencias?: string;
}
