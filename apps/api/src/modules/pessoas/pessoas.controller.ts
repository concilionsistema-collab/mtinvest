import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Pessoa } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CriarPessoaDto } from './dto/criar-pessoa.dto';
import { PessoasService } from './pessoas.service';

@Controller('pessoas')
export class PessoasController {
  constructor(private readonly pessoasService: PessoasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(@CurrentTenant() tenantId: string, @Body() dto: CriarPessoaDto): Promise<Pessoa> {
    return this.pessoasService.criar(tenantId, dto);
  }

  @Get()
  listar(@CurrentTenant() tenantId: string): Promise<Pessoa[]> {
    return this.pessoasService.listar(tenantId);
  }
}
