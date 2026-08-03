import { IsString, MinLength } from 'class-validator';
import { RefreshTokenInput } from '@crm/shared';

export class RefreshTokenDto implements RefreshTokenInput {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
