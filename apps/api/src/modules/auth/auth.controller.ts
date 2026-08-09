import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoginResultado } from '@crm/shared';
import { Public } from '../../common/auth/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthService } from './auth.service';

// Implementa US-002/US-003 (ART-014, EPIC-01 - Identidade e fundação).
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Mais restritivo que o default global (100/min, app.module.ts): freia um
  // único IP martelando tentativas de login especificamente. O bloqueio por
  // CONTA (LoginLockoutService, dentro de AuthService) é a defesa real
  // contra força bruta - este limite por IP é só a primeira camada.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResultado> {
    return this.authService.login(dto);
  }

  // @Public(): um access token expirado é precisamente o motivo de chamar
  // isto - exigir um Authorization: Bearer válido aqui seria contraditório.
  // A identidade/tenant vêm só do refresh token (verificado dentro do
  // service), nunca de um header separado.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<LoginResultado> {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto);
  }
}
