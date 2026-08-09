import { IsIn, IsString, MinLength } from 'class-validator';
import { ContestacaoDecisao, DecidirContestacaoInput } from '@crm/shared';

const DECISOES: ContestacaoDecisao[] = ['CONFIRMADA', 'RETIFICADA'];

export class DecidirContestacaoDto implements DecidirContestacaoInput {
  @IsIn(DECISOES)
  decisao!: ContestacaoDecisao;

  @IsString()
  @MinLength(3)
  justificativaDecisao!: string;
}
