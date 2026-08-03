import { IsIn } from 'class-validator';
import { MoverOportunidadeInput, OportunidadeEstado } from '@crm/shared';

const ESTADOS: OportunidadeEstado[] = [
  'QUALIFICACAO',
  'VISITA_AGENDADA',
  'VISITA_CONFIRMADA',
  'VISITA_REALIZADA',
  'PROPOSTA_ENVIADA',
  'EM_CONTRAPROPOSTA',
  'RESERVA',
  'DOCUMENTACAO_CONCLUIDA',
  'FECHADA',
  'PERDIDA',
];

export class MoverOportunidadeDto implements MoverOportunidadeInput {
  @IsIn(ESTADOS)
  estadoDestino!: OportunidadeEstado;
}
