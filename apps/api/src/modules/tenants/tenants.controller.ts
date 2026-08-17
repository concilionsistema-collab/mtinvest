import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CriarTenantResultado } from '@crm/shared';
import { Public } from '../../common/auth/public.decorator';
import { CriarTenantDto } from './dto/criar-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  // Throttle apertado (mesmo espirito de AuthController.login): endpoint
  // publico que cria linhas no banco (Tenant/Unidade/Usuario) - sem isso, um
  // unico IP poderia automatizar a criacao de tenants em massa.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(@Body() dto: CriarTenantDto): Promise<CriarTenantResultado> {
    return this.tenantsService.criar(dto);
  }
}
