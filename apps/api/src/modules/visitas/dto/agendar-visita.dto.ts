import { IsDateString, IsString } from 'class-validator';
import { AgendarVisitaInput } from '@crm/shared';

// Implementa US-014 (ART-014): "Agendar visita e obter confirmação do cliente".
export class AgendarVisitaDto implements AgendarVisitaInput {
  @IsString()
  oportunidadeId!: string;

  @IsDateString()
  dataHora!: string;
}
