import { IsString, MinLength } from 'class-validator';
import { LoginInput } from '@crm/shared';

export class LoginDto implements LoginInput {
  @IsString()
  tenantId!: string;

  @IsString()
  email!: string;

  @IsString()
  @MinLength(1)
  senha!: string;
}
