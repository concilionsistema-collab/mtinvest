import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Tarefa } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { CriarTarefaDto } from './dto/criar-tarefa.dto';
import { TarefasService } from './tarefas.service';

// EXTENSAO REGISTRADA: ver comentario em tarefas.service.ts.
@Controller('tarefas')
export class TarefasController {
  constructor(private readonly tarefasService: TarefasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Body() dto: CriarTarefaDto,
  ): Promise<Tarefa> {
    return this.tarefasService.criar(tenantId, chamador.id, dto);
  }

  @Get()
  listar(@CurrentTenant() tenantId: string, @CurrentUsuario() chamador: UsuarioAutenticado): Promise<Tarefa[]> {
    return this.tarefasService.listar(tenantId, chamador.id);
  }

  @Patch(':id/concluir')
  concluir(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Tarefa> {
    return this.tarefasService.concluir(tenantId, chamador.id, id);
  }

  @Patch(':id/reabrir')
  reabrir(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<Tarefa> {
    return this.tarefasService.reabrir(tenantId, chamador.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remover(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Param('id') id: string,
  ): Promise<void> {
    return this.tarefasService.remover(tenantId, chamador.id, id);
  }
}
