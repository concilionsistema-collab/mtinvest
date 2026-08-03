import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransferenciaDeCarteira as TransferenciaRecord } from '@prisma/client';
import { TransferenciaDeCarteira } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';

function paraTransferencia(registro: TransferenciaRecord): TransferenciaDeCarteira {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    leadId: registro.leadId,
    origemUsuarioId: registro.origemUsuarioId,
    destinoUsuarioId: registro.destinoUsuarioId,
    estado: registro.estado,
    motivo: registro.motivo,
    slaDecisaoFim: registro.slaDecisaoFim ? registro.slaDecisaoFim.toISOString() : null,
    criadoEm: registro.criadoEm.toISOString(),
    decididoEm: registro.decididoEm ? registro.decididoEm.toISOString() : null,
  };
}

// US-010 (ART-014) / RN-008 (ART-004), CA-002: fila de decisao do gestor para
// leads em estagio avancado cujo responsavel foi desligado (ver
// UsuariosService.desligar, que cria os registros PENDENTE aqui).
@Injectable()
export class CarteirasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // RN-008: "vencido o SLA, o item escala para a matriz". Roda tanto
  // "preguicosamente" (a cada listagem/decisao, para consistencia imediata)
  // quanto via SchedulerService (varredura agendada real, ver
  // executarVarreduraAutomaticaTx). ATUALIZADO: gera RegistroDeAuditoria com
  // ator sistema (null) por item escalado - fecha a lacuna antes registrada
  // aqui ("sem ator humano neste evento automatico").
  private async escalarVencidos(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const vencidas = await tx.transferenciaDeCarteira.findMany({
      where: { tenantId, estado: 'PENDENTE', slaDecisaoFim: { lt: new Date() } },
    });
    for (const transferencia of vencidas) {
      await tx.transferenciaDeCarteira.update({
        where: { id: transferencia.id },
        data: { estado: 'ESCALADA_MATRIZ' },
      });
      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        null,
        'TRANSFERENCIA_CARTEIRA_ESCALADA',
        'TransferenciaDeCarteira',
        transferencia.id,
        'PENDENTE->ESCALADA_MATRIZ (SLA de decisao vencido, RN-008)',
      );
    }
  }

  // SchedulerService (jobs reais - README, "Próximos passos sugeridos"):
  // ponto de entrada unico para a varredura agendada deste modulo.
  async executarVarreduraAutomaticaTx(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await this.escalarVencidos(tx, tenantId);
  }

  // Permissoes (US-010, "Gestor de unidade decide destino"): so GESTOR_UNIDADE
  // ve a fila, sempre escopada aos leads da propria unidade - nao existe
  // "Gestor da matriz" nesta fatia (ver UsuarioPerfil, US-002), entao o
  // escalonamento para matriz (RN-008) fica visivel aqui mas sem acao
  // possivel via API - lacuna registrada, nao escondida (ver decidir()).
  async listarPendentes(tenantId: string, chamador: UsuarioAutenticado): Promise<TransferenciaDeCarteira[]> {
    if (chamador.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException(
        'Apenas Gestor de unidade decide destino de item na fila de transferência (RN-008, ART-004).',
      );
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      await this.escalarVencidos(tx, tenantId);

      return tx.transferenciaDeCarteira
        .findMany({
          where: { tenantId, lead: { unidadeId: chamador.unidadeId } },
          orderBy: { criadoEm: 'asc' },
        })
        .then((registros) => registros.map(paraTransferencia));
    });
  }

  // CA-002: gestor decide o destino dentro do SLA. Fora do SLA (ESCALADA_MATRIZ)
  // a decisao passa a exigir o perfil "matriz", que nao existe nesta fatia -
  // rejeitado explicitamente em vez de permitir silenciosamente (mesma postura
  // default-deny de US-024 para a visao "consolidado" da matriz).
  async decidir(
    tenantId: string,
    transferenciaId: string,
    destinoUsuarioId: string,
    chamador: UsuarioAutenticado,
  ): Promise<TransferenciaDeCarteira> {
    if (chamador.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException(
        'Apenas Gestor de unidade decide destino de item na fila de transferência (RN-008, ART-004).',
      );
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      await this.escalarVencidos(tx, tenantId);

      const transferencia = await tx.transferenciaDeCarteira.findFirst({
        where: { id: transferenciaId, tenantId },
        include: { lead: true },
      });
      if (!transferencia) {
        throw new NotFoundException('Transferência de carteira não encontrada neste tenant.');
      }
      if (transferencia.lead.unidadeId !== chamador.unidadeId) {
        throw new ForbiddenException('Sem permissão sobre transferência de outra unidade (RN-008, ART-004).');
      }
      if (transferencia.estado === 'ESCALADA_MATRIZ') {
        throw new ForbiddenException(
          'SLA de decisão vencido - item escalado para a matriz (RN-008); esse perfil não existe nesta fatia, decisão indisponível via API.',
        );
      }
      if (transferencia.estado === 'TRANSFERIDA') {
        throw new BadRequestException('Esta transferência já foi decidida.');
      }

      const destino = await tx.usuario.findFirst({
        where: { id: destinoUsuarioId, tenantId, unidadeId: chamador.unidadeId, status: 'ATIVO' },
      });
      if (!destino) {
        throw new BadRequestException(
          'O destino deve ser um usuário ativo da mesma unidade do lead (RN-002, ART-004).',
        );
      }

      await tx.lead.update({
        where: { id: transferencia.leadId },
        data: { responsavelUsuarioId: destino.id },
      });

      const decidida = await tx.transferenciaDeCarteira.update({
        where: { id: transferencia.id },
        data: { estado: 'TRANSFERIDA', destinoUsuarioId: destino.id, decididoEm: new Date() },
      });

      // ART-005, secao 9: escrita em TransferenciaDeCarteira.estado e em
      // Lead.responsavelUsuarioId gera RegistroDeAuditoria - aqui ha um ator
      // humano real (o gestor que decidiu o destino).
      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        chamador.id,
        'TRANSFERENCIA_CARTEIRA_DECIDIDA',
        'TransferenciaDeCarteira',
        transferencia.id,
        `destino=${destino.id}`,
      );
      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        chamador.id,
        'LEAD_ESTADO_ALTERADO',
        'Lead',
        transferencia.leadId,
        `responsavel transferido via fila de decisao do gestor (US-010, CA-002) para ${destino.id}`,
      );

      return paraTransferencia(decidida);
    });
  }
}
