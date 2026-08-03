import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChecklistDocumentoItem } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { ConcluirChecklistItemDto } from './dto/concluir-checklist-item.dto';
import { ChecklistService } from './checklist.service';

// Implementa US-019 (ART-014, EPIC-07 - Documentação e fechamento).
@Controller('oportunidades/:oportunidadeId/checklist')
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Get()
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() chamador: UsuarioAutenticado,
    @Param('oportunidadeId') oportunidadeId: string,
  ): Promise<ChecklistDocumentoItem[]> {
    return this.checklistService.listarPorOportunidade(tenantId, oportunidadeId, chamador.unidadeId);
  }

  @Post(':itemId/concluir')
  concluir(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('oportunidadeId') oportunidadeId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ConcluirChecklistItemDto,
  ): Promise<ChecklistDocumentoItem> {
    return this.checklistService.concluirItem(tenantId, oportunidadeId, itemId, dto.concluido, ator);
  }
}
