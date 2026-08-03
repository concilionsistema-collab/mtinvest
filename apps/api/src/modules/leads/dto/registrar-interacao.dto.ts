import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { InteracaoTipo, RegistrarInteracaoInput } from '@crm/shared';

const TIPOS: InteracaoTipo[] = ['CONTATO', 'VISITA', 'PROPOSTA', 'NOTA', 'PAUSA'];

export class RegistrarInteracaoDto implements RegistrarInteracaoInput {
  @IsIn(TIPOS)
  tipo!: InteracaoTipo;

  @IsOptional()
  @IsBoolean()
  qualificado?: boolean;
}
