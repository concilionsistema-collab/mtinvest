import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistDocumentoItem as ChecklistItemRecord, Prisma } from '@prisma/client';
import { ChecklistDocumentoItem } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';

// RN-308 (ART-009): lista inicial de documentos obrigatorios por finalidade
// do imovel. HIPOTESE DE TRABALHO, nao uma lista juridicamente validada -
// revisar antes de producao (mesmo padrao de simplificacao documentada de
// outras constantes deste projeto, ex.: MINIMO_TENTATIVAS_PARA_PERDA em
// OportunidadesService).
const ITENS_PADRAO_VENDA = [
  'RG/CPF do comprador',
  'Comprovante de renda do comprador',
  'Certidão de matrícula atualizada do imóvel',
  'Comprovante de residência do comprador',
];

const ITENS_PADRAO_LOCACAO = [
  'RG/CPF do locatário',
  'Comprovante de renda do locatário',
  'Garantia locatícia (fiador, caução ou seguro-fiança)',
  'Comprovante de residência do locatário',
];

function itensPadraoPara(finalidade: string): string[] {
  if (finalidade === 'LOCACAO') return ITENS_PADRAO_LOCACAO;
  if (finalidade === 'AMBOS') return [...new Set([...ITENS_PADRAO_VENDA, ...ITENS_PADRAO_LOCACAO])];
  return ITENS_PADRAO_VENDA;
}

function paraChecklistItem(registro: ChecklistItemRecord): ChecklistDocumentoItem {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    oportunidadeId: registro.oportunidadeId,
    descricao: registro.descricao,
    obrigatorio: registro.obrigatorio,
    concluido: registro.concluido,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class ChecklistService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // Gera os itens padrao na primeira vez que o checklist desta oportunidade
  // e acessado (US-019). "Preguicoso" por design, mesmo padrao ja usado em
  // outros pontos do projeto (ver README, secao "checagem preguicosa") -
  // nao ha um evento explicito de "entrar em documentacao" que dispare isso.
  async gerarItensSeNecessarioTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    oportunidadeId: string,
  ): Promise<void> {
    const existente = await tx.checklistDocumentoItem.findFirst({ where: { tenantId, oportunidadeId } });
    if (existente) {
      return;
    }
    const oportunidade = await tx.oportunidade.findFirst({ where: { id: oportunidadeId, tenantId } });
    if (!oportunidade) {
      throw new NotFoundException('Oportunidade não encontrada neste tenant.');
    }
    const imovel = await tx.imovel.findFirst({ where: { id: oportunidade.imovelId, tenantId } });
    if (!imovel) {
      throw new BadRequestException('Imóvel da oportunidade não encontrado.');
    }
    const descricoes = itensPadraoPara(imovel.finalidade);
    await tx.checklistDocumentoItem.createMany({
      data: descricoes.map((descricao) => ({ tenantId, oportunidadeId, descricao, obrigatorio: true })),
    });
  }

  // PENDENCIA DE README FECHADA: leitura nao verificava unidade - ver mesma
  // nota em PropostasService.listarPorOportunidade.
  async listarPorOportunidade(
    tenantId: string,
    oportunidadeId: string,
    unidadeId: string,
  ): Promise<ChecklistDocumentoItem[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await tx.oportunidade.findFirst({
        where: { id: oportunidadeId, tenantId, lead: { unidadeId } },
      });
      if (!oportunidade) {
        throw new NotFoundException('Oportunidade não encontrada nesta unidade.');
      }
      await this.gerarItensSeNecessarioTx(tx, tenantId, oportunidadeId);
      const registros = await tx.checklistDocumentoItem.findMany({
        where: { tenantId, oportunidadeId },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraChecklistItem);
    });
  }

  // US-019, "cada item marcado é auditado": agora que a autenticação real
  // (US-002/US-003) existe, o autor vem de CurrentUsuario() no controller.
  // PENDENCIA DE README FECHADA: "Permissões" de US-019 e "Administrativo,
  // Gestor de unidade" - diferente das demais acoes deste modulo (que sao
  // "responsavel pela oportunidade"), aqui e explicitamente o GESTOR_UNIDADE
  // da unidade do lead que decide, nao o corretor individual. "Administrativo"
  // nao existe como perfil nesta fatia (ver UsuarioPerfil, US-002).
  async concluirItem(
    tenantId: string,
    oportunidadeId: string,
    itemId: string,
    concluido: boolean,
    ator: UsuarioAutenticado,
  ): Promise<ChecklistDocumentoItem> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await tx.oportunidade.findFirst({
        where: { id: oportunidadeId, tenantId, lead: { unidadeId: ator.unidadeId } },
      });
      if (!oportunidade) {
        throw new NotFoundException('Oportunidade não encontrada nesta unidade.');
      }
      if (ator.perfil !== 'GESTOR_UNIDADE') {
        throw new ForbiddenException(
          'Apenas o Gestor de unidade pode marcar item de checklist (ver "Permissões", US-019).',
        );
      }

      const item = await tx.checklistDocumentoItem.findFirst({ where: { id: itemId, tenantId, oportunidadeId } });
      if (!item) {
        throw new NotFoundException('Item de checklist não encontrado nesta oportunidade.');
      }
      const atualizado = await tx.checklistDocumentoItem.update({ where: { id: itemId }, data: { concluido } });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'CHECKLIST_ITEM_ALTERADO',
        'ChecklistDocumentoItem',
        itemId,
        `concluido=${concluido}`,
      );

      return paraChecklistItem(atualizado);
    });
  }

  // US-019, CA-001 / RN-308: bloqueia a geracao do "contrato" (na pratica,
  // a transicao para DOCUMENTACAO_CONCLUIDA - ver interpretação registrada
  // em OportunidadesService.moverEstagioTx) enquanto existir item
  // obrigatorio nao concluido. Reaproveitado dentro da mesma transacao de
  // moverEstagioTx (nao abre uma transacao propria).
  async estaCompletoTx(tx: Prisma.TransactionClient, tenantId: string, oportunidadeId: string): Promise<boolean> {
    await this.gerarItensSeNecessarioTx(tx, tenantId, oportunidadeId);
    const pendentes = await tx.checklistDocumentoItem.count({
      where: { tenantId, oportunidadeId, obrigatorio: true, concluido: false },
    });
    return pendentes === 0;
  }
}
