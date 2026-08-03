import { IsIn, IsOptional, IsString } from 'class-validator';
import { GarantiaTipo, RegistrarGarantiaInput } from '@crm/shared';

const TIPOS: GarantiaTipo[] = ['FIADOR', 'CAUCAO', 'SEGURO_FIANCA'];

// Implementa US-104/US-105 (ART-015-backlog-fase-2.md) / RN-402/RN-403 (ART-010).
export class RegistrarGarantiaDto implements RegistrarGarantiaInput {
  @IsIn(TIPOS)
  tipo!: GarantiaTipo;

  @IsOptional()
  @IsString()
  fiadorPessoaId?: string;
}
