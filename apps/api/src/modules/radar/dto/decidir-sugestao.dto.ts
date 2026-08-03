import { IsIn } from 'class-validator';
import { DecidirSugestaoInput, SugestaoRadarStatus } from '@crm/shared';

const STATUS: SugestaoRadarStatus[] = ['ACEITA', 'RECUSADA'];

export class DecidirSugestaoDto implements DecidirSugestaoInput {
  @IsIn(STATUS)
  status!: SugestaoRadarStatus;
}
