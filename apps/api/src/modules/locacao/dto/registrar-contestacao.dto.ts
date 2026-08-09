import { IsString, MinLength } from 'class-validator';
import { RegistrarContestacaoInput } from '@crm/shared';

export class RegistrarContestacaoDto implements RegistrarContestacaoInput {
  @IsString()
  @MinLength(3)
  motivo!: string;

  // DEC-NEG-016: evidência (foto/vídeo/laudo) é obrigatória, nunca opcional.
  @IsString()
  @MinLength(1)
  evidencia!: string;
}
