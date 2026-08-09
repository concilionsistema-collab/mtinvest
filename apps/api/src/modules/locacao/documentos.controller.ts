import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DocumentoDeContrato } from '@crm/shared';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { CurrentUsuario } from '../../common/auth/current-usuario.decorator';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AnexarDocumentoDto } from './dto/anexar-documento.dto';
import { DocumentosService } from './documentos.service';

// Implementa US-112 (ART-015-backlog-fase-2.md) / RN-411 (ART-010).
@Controller('locacao/contratos')
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @Post(':contratoId/documentos')
  @HttpCode(HttpStatus.CREATED)
  anexar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
    @Body() dto: AnexarDocumentoDto,
  ): Promise<DocumentoDeContrato> {
    return this.documentosService.anexar(tenantId, ator.id, ator.unidadeId, contratoId, dto);
  }

  @Get(':contratoId/documentos')
  listar(
    @CurrentTenant() tenantId: string,
    @CurrentUsuario() ator: UsuarioAutenticado,
    @Param('contratoId') contratoId: string,
  ): Promise<DocumentoDeContrato[]> {
    return this.documentosService.listar(tenantId, ator.unidadeId, contratoId);
  }
}
