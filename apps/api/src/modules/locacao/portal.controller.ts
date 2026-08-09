import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PortalContratoResumo } from '@crm/shared';
import { Public } from '../../common/auth/public.decorator';
import { PortalService } from './portal.service';

// Implementa US-113 (ART-015-backlog-fase-2.md) / RN-413 (ART-010 §14: "GET
// /portal/contratos/{id}"). REINTERPRETAÇÃO REGISTRADA: "{id}" é o token
// opaco de acesso, não o UUID real do contrato - não existe outro
// identificador na URL pública pra manipular (ART-010 §17). @Public(): quem
// acessa é o proprietário/inquilino, que nunca tem um JWT (não é Usuario).
@Controller('portal/contratos')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  // Mesmo raciocínio do throttle de POST /auth/login: o token é o único
  // segredo que protege este endpoint, então um limite de IP mais apertado
  // que o global (100/min) desacelera tentativa de força bruta.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Public()
  @Get(':token')
  consultar(@Param('token') token: string): Promise<PortalContratoResumo> {
    return this.portalService.consultar(token);
  }
}
