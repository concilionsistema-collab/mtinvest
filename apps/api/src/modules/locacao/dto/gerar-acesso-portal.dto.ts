import { IsString, MinLength } from 'class-validator';
import { GerarAcessoPortalInput } from '@crm/shared';

export class GerarAcessoPortalDto implements GerarAcessoPortalInput {
  @IsString()
  @MinLength(1)
  pessoaId!: string;
}
