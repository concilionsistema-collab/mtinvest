import { IsIn } from 'class-validator';
import { RealizarVisitaInput, VisitaResultado } from '@crm/shared';

const RESULTADOS: VisitaResultado[] = [
  'INTERESSADO',
  'NAO_INTERESSADO',
  'INTERESSADO_EM_OUTRO_IMOVEL',
  'NAO_COMPARECEU',
];

// Implementa US-015 (ART-014): "Registrar resultado da visita realizada".
export class RealizarVisitaDto implements RealizarVisitaInput {
  @IsIn(RESULTADOS)
  resultado!: VisitaResultado;
}
