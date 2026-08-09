import { IsString, MinLength } from 'class-validator';
import { SolicitarEliminacaoInput } from '@crm/shared';

// Implementa ART-012 (LGPD): "processo de atendimento a pedido de eliminação".
export class SolicitarEliminacaoDto implements SolicitarEliminacaoInput {
  @IsString()
  @MinLength(3)
  motivo!: string;
}
