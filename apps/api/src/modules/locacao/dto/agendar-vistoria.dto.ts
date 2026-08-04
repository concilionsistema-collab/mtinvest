import { IsDateString, IsIn, IsString } from 'class-validator';
import { AgendarVistoriaInput, VistoriaTipo } from '@crm/shared';

const TIPOS: VistoriaTipo[] = ['ENTRADA', 'SAIDA'];

// Implementa US-106 (ART-015-backlog-fase-2.md) / RN-404 (ART-010).
export class AgendarVistoriaDto implements AgendarVistoriaInput {
  @IsString()
  contratoDeLocacaoId!: string;

  @IsIn(TIPOS)
  tipo!: VistoriaTipo;

  @IsDateString()
  dataHora!: string;
}
