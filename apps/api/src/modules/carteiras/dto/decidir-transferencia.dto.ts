import { IsString } from 'class-validator';
import { DecidirTransferenciaInput } from '@crm/shared';

export class DecidirTransferenciaDto implements DecidirTransferenciaInput {
  @IsString()
  destinoUsuarioId!: string;
}
