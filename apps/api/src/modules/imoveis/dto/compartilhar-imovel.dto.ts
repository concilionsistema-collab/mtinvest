import { IsIn } from 'class-validator';
import { CompartilharImovelInput, ImovelEscopoCompartilhamento } from '@crm/shared';

const ESCOPOS: ImovelEscopoCompartilhamento[] = ['FECHADO', 'REDE', 'REGIAO', 'LISTA'];

// Implementa US-005 (ART-014): "Compartilhar imóvel com outras unidades".
export class CompartilharImovelDto implements CompartilharImovelInput {
  @IsIn(ESCOPOS)
  escopoCompartilhamento!: ImovelEscopoCompartilhamento;
}
