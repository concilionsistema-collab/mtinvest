import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    // registerAsync (nao um objeto estatico) para garantir que
    // process.env.JWT_SECRET ja foi carregado pelo dotenv/config de main.ts
    // antes da fabrica rodar (timing de bootstrap do Nest, nao de import).
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        // Default de segurança - AuthService.emitirTokens sempre passa
        // expiresIn explícito por chamada (access 1h / refresh 30d), este
        // valor só vale se algum sign() futuro esquecer de informar o dele.
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [JwtModule],
})
export class AuthModule {}
