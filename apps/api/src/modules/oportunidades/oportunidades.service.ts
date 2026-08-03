import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ComissaoCruzadaAcionada as ComissaoCruzadaRecord,
  Oportunidade as OportunidadeRecord,
  Prisma,
} from '@prisma/client';
import { ComissaoCruzadaAcionada, CriarOportunidadeInput, Oportunidade, OportunidadeEstado } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { ChecklistService } from '../checklist/checklist.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

/** RN-302 (ART-009): mínimo de tentativas antes de poder marcar como perdida por falta de resposta - hipótese de trabalho. */
const MINIMO_TENTATIVAS_PARA_PERDA = 3;

// ART-009, secao 8.1: mapa de transicoes validas. Reativacao PERDIDA ->
// QUALIFICACAO fica fora de escopo (depende de DEC-NEG-011, ver Lead/US-009).
const TRANSICOES_VALIDAS: Record<OportunidadeEstado, OportunidadeEstado[]> = {
  QUALIFICACAO: ['VISITA_AGENDADA', 'PROPOSTA_ENVIADA', 'PERDIDA'],
  VISITA_AGENDADA: ['VISITA_CONFIRMADA', 'PERDIDA'],
  VISITA_CONFIRMADA: ['VISITA_REALIZADA', 'PERDIDA'],
  VISITA_REALIZADA: ['PROPOSTA_ENVIADA', 'PERDIDA'],
  PROPOSTA_ENVIADA: ['EM_CONTRAPROPOSTA', 'RESERVA', 'PERDIDA'],
  // EM_CONTRAPROPOSTA -> EM_CONTRAPROPOSTA (auto-transicao): permite mais de
  // uma rodada de negociacao (US-017) sem inventar um estado novo fora de
  // ART-009, secao 8.1.
  EM_CONTRAPROPOSTA: ['EM_CONTRAPROPOSTA', 'RESERVA', 'PERDIDA'],
  RESERVA: ['DOCUMENTACAO_CONCLUIDA', 'PERDIDA'],
  DOCUMENTACAO_CONCLUIDA: ['FECHADA'],
  FECHADA: [],
  PERDIDA: [],
};

function paraOportunidade(registro: OportunidadeRecord): Oportunidade {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    leadId: registro.leadId,
    imovelId: registro.imovelId,
    estado: registro.estado,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

function paraComissaoCruzada(registro: ComissaoCruzadaRecord): ComissaoCruzadaAcionada {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    oportunidadeId: registro.oportunidadeId,
    unidadeProprietariaImovelId: registro.unidadeProprietariaImovelId,
    unidadeResponsavelLeadId: registro.unidadeResponsavelLeadId,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class OportunidadesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly checklistService: ChecklistService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // US-012 (ART-014) / RN-301, RN-312 (ART-009): cria em estado QUALIFICACAO,
  // vinculada a exatamente um lead e um imovel. So o responsavel pelo lead
  // pode criar (CA-002); duplicidade lead+imovel ja ativa e bloqueada.
  async criar(tenantId: string, input: CriarOportunidadeInput, usuarioId: string): Promise<Oportunidade> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: input.leadId, tenantId } });
      if (!lead) {
        throw new BadRequestException('O lead informado não existe ou não pertence a este tenant.');
      }
      if (lead.responsavelUsuarioId !== usuarioId) {
        throw new BadRequestException(
          'Apenas o responsável atual pelo lead pode criar uma oportunidade a partir dele (RN-312, ART-009).',
        );
      }

      const imovel = await tx.imovel.findFirst({ where: { id: input.imovelId, tenantId } });
      if (!imovel) {
        throw new BadRequestException('O imóvel informado não existe ou não pertence a este tenant.');
      }

      const existente = await tx.oportunidade.findFirst({
        where: { tenantId, leadId: input.leadId, imovelId: input.imovelId, estado: { not: 'PERDIDA' } },
      });
      if (existente) {
        throw new BadRequestException(
          'Já existe uma oportunidade ativa para este lead e este imóvel (CA-002, US-012).',
        );
      }

      const criada = await tx.oportunidade.create({
        data: { tenantId, leadId: input.leadId, imovelId: input.imovelId, estado: 'QUALIFICACAO' },
      });

      // Auditoria (US-012, "criação é auditada").
      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        usuarioId,
        'OPORTUNIDADE_CRIADA',
        'Oportunidade',
        criada.id,
      );

      return paraOportunidade(criada);
    });
  }

  // PENDENCIA DE README FECHADA ("Próximos passos sugeridos", item 1): antes,
  // qualquer usuário do tenant via o Kanban (US-011) de qualquer unidade. Uma
  // Oportunidade pertence organizacionalmente à unidade do seu Lead (mesmo
  // quando o imóvel é de outra unidade via compartilhamento - RN-309 já trata
  // esse caso separadamente com ComissaoCruzadaAcionada), entao o filtro e
  // pela unidade do lead, nao do imovel.
  // INTERPRETACAO REGISTRADA: US-011 sugere algo mais estrito para o
  // CORRETOR ("Corretor ve suas oportunidades; Gestor de unidade ve todas as
  // da unidade") - implementado aqui como unit-wide para os dois perfis, nao
  // self-scoped para CORRETOR, para nao fragmentar a visao de equipe na UI
  // atual (o Kanban mostra o responsavel de cada card). Mesma decisao vale
  // para LeadsService.listar/ImoveisService.listar.
  async listar(tenantId: string, unidadeId: string): Promise<Oportunidade[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.oportunidade.findMany({
        where: { tenantId, lead: { unidadeId } },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraOportunidade);
    });
  }

  // PENDENCIA DE README FECHADA: "Permissões" de US-011 ("responsável pela
  // oportunidade") nao era verificada aqui - qualquer usuario autenticado do
  // tenant conseguia mover o estagio de qualquer oportunidade, de qualquer
  // unidade. Reaproveita o mesmo criterio ja usado em criar()/fechar()
  // (RN-312): responsavel pelo lead. Nao concede excecao para GESTOR_UNIDADE
  // porque ART-014 nao registra essa excecao para esta acao especifica
  // (diferente de US-019/checklist, que explicitamente e "Administrativo,
  // Gestor de unidade") - postura default-deny, documentada.
  async validarResponsavelDaOportunidade(
    tx: Prisma.TransactionClient,
    tenantId: string,
    oportunidadeId: string,
    usuarioId: string,
  ): Promise<OportunidadeRecord> {
    const oportunidade = await tx.oportunidade.findFirst({ where: { id: oportunidadeId, tenantId } });
    if (!oportunidade) {
      throw new NotFoundException('Oportunidade não encontrada neste tenant.');
    }
    const lead = await tx.lead.findFirst({ where: { id: oportunidade.leadId, tenantId } });
    if (!lead || lead.responsavelUsuarioId !== usuarioId) {
      throw new BadRequestException('Apenas o responsável pela oportunidade pode realizar esta ação.');
    }
    return oportunidade;
  }

  // US-011 / CA-002 (ART-014) / ART-009, secao 8.1: so aceita transicoes
  // presentes no mapa. RN-307 (ART-009): so uma oportunidade por imovel pode
  // estar em RESERVA por vez. Interpretacao de RN-302/US-013 CA-001: mover
  // para PERDIDA exige minimo de tentativas de contato registradas no lead -
  // sem isso, nao ha como o sistema saber se o "sem resposta" e legitimo.
  async moverEstagio(
    tenantId: string,
    oportunidadeId: string,
    destino: OportunidadeEstado,
    atorUsuarioId: string,
  ): Promise<Oportunidade> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      await this.validarResponsavelDaOportunidade(tx, tenantId, oportunidadeId, atorUsuarioId);
      const atualizada = await this.moverEstagioTx(tx, tenantId, oportunidadeId, destino, atorUsuarioId);
      return paraOportunidade(atualizada);
    });
  }

  // Versao "tx" publica, reaproveitada por VisitasService (EPIC-05),
  // PropostasService (EPIC-06), ReservasService (EPIC-06) e OportunidadesService.fechar
  // (US-020) para manter a oportunidade sincronizada com o estado do
  // respectivo domínio dentro da mesma transação (agendar ->
  // VISITA_AGENDADA, confirmar -> VISITA_CONFIRMADA, etc.). Por ser o
  // chokepoint único de escrita em Oportunidade.estado, também é o único
  // lugar que precisa gerar RegistroDeAuditoria para cobrir US-011 a US-020
  // de uma vez (ver auditoria abaixo).
  async moverEstagioTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    oportunidadeId: string,
    destino: OportunidadeEstado,
    atorUsuarioId: string,
  ): Promise<OportunidadeRecord> {
    const oportunidade = await tx.oportunidade.findFirst({ where: { id: oportunidadeId, tenantId } });
    if (!oportunidade) {
      throw new NotFoundException('Oportunidade não encontrada neste tenant.');
    }

    const permitidas = TRANSICOES_VALIDAS[oportunidade.estado];
    if (!permitidas.includes(destino)) {
      throw new BadRequestException(
        `Transição de "${oportunidade.estado}" para "${destino}" não é permitida (ART-009, seção 8.1).`,
      );
    }

    if (destino === 'RESERVA') {
      const outraReserva = await tx.oportunidade.findFirst({
        where: { tenantId, imovelId: oportunidade.imovelId, estado: 'RESERVA', id: { not: oportunidadeId } },
      });
      if (outraReserva) {
        throw new BadRequestException('Este imóvel já está reservado por outra oportunidade (RN-307, ART-009).');
      }
    }

    if (destino === 'PERDIDA') {
      const tentativas = await tx.interacaoDeLead.count({
        where: { tenantId, leadId: oportunidade.leadId, tipo: 'CONTATO' },
      });
      if (tentativas < MINIMO_TENTATIVAS_PARA_PERDA) {
        throw new BadRequestException(
          `É preciso registrar ao menos ${MINIMO_TENTATIVAS_PARA_PERDA} tentativas de contato antes de marcar como perdida (CA-001, US-013). Registradas: ${tentativas}.`,
        );
      }
    }

    // US-019, CA-001 (RN-308, ART-009): bloqueia a geração do "contrato"
    // enquanto o checklist documental obrigatório não estiver completo. Este
    // projeto não tem um passo separado de "gerar contrato" - a transição
    // para DOCUMENTACAO_CONCLUIDA é tratada como esse gatilho.
    if (destino === 'DOCUMENTACAO_CONCLUIDA') {
      const completo = await this.checklistService.estaCompletoTx(tx, tenantId, oportunidadeId);
      if (!completo) {
        throw new BadRequestException(
          'O checklist documental precisa estar completo antes de gerar o contrato (CA-001, US-019; RN-308, ART-009).',
        );
      }
    }

    const atualizada = await tx.oportunidade.update({ where: { id: oportunidadeId }, data: { estado: destino } });

    // ART-005, secao 9 exige auditar Lead.estado/Imovel.estadoCompartilhamento
    // explicitamente; Oportunidade.estado nao esta na lista literal, mas e o
    // equivalente do funil de vendas a esses estados (mesmo espirito da
    // regra) - decisao de cobrir aqui tambem, num unico chokepoint.
    await this.auditoriaService.registrarTx(
      tx,
      tenantId,
      atorUsuarioId,
      'OPORTUNIDADE_ESTADO_ALTERADO',
      'Oportunidade',
      oportunidadeId,
      `${oportunidade.estado}->${destino}`,
    );

    return atualizada;
  }

  // US-013 (ART-014) / RN-302 (ART-009): reaproveita InteracaoDeLead como
  // "TentativaDeContato" (tipo CONTATO, qualificado false), vinculada ao
  // lead da oportunidade. Ator vem sempre de CurrentUsuario() (ver controller).
  // PENDENCIA DE README FECHADA: "Permissões" de US-013 ("responsável pelo
  // lead") nao era verificada - qualquer usuario do tenant conseguia
  // registrar tentativas de contato em qualquer oportunidade, inflando o
  // contador usado para liberar a transicao para PERDIDA (MINIMO_TENTATIVAS_PARA_PERDA).
  async registrarTentativaDeContato(
    tenantId: string,
    oportunidadeId: string,
    usuarioId: string,
  ): Promise<{ tentativasRegistradas: number }> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await this.validarResponsavelDaOportunidade(tx, tenantId, oportunidadeId, usuarioId);

      await tx.interacaoDeLead.create({
        data: { tenantId, leadId: oportunidade.leadId, usuarioId, tipo: 'CONTATO', qualificado: false },
      });

      const tentativasRegistradas = await tx.interacaoDeLead.count({
        where: { tenantId, leadId: oportunidade.leadId, tipo: 'CONTATO' },
      });
      return { tentativasRegistradas };
    });
  }

  // US-020 (ART-014) / RN-309 (ART-009): fecha a oportunidade (só permitido
  // a partir de DOCUMENTACAO_CONCLUIDA, ver TRANSICOES_VALIDAS - o que já
  // exige checklist completo, US-019) e, se o imóvel pertencer a unidade
  // diferente da unidade do lead, registra o gatilho de comissão cruzada.
  // INTERPRETAÇÃO REGISTRADA (CA-001, US-020): não existe neste projeto um
  // passo separado de "assinar contrato" - a transição para
  // DOCUMENTACAO_CONCLUIDA é tratada como equivalente até que exista um
  // módulo real de assinatura eletrônica.
  async fechar(tenantId: string, oportunidadeId: string, usuarioId: string): Promise<Oportunidade> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await tx.oportunidade.findFirst({ where: { id: oportunidadeId, tenantId } });
      if (!oportunidade) {
        throw new NotFoundException('Oportunidade não encontrada neste tenant.');
      }
      const lead = await tx.lead.findFirst({ where: { id: oportunidade.leadId, tenantId } });
      if (!lead) {
        throw new BadRequestException('Lead da oportunidade não encontrado.');
      }
      if (lead.responsavelUsuarioId !== usuarioId) {
        throw new BadRequestException(
          'Apenas o responsável pela oportunidade pode fechá-la (ver "Permissões", US-020).',
        );
      }

      // Auditoria (US-020, "fechamento é auditado"): coberta genericamente
      // por moverEstagioTx (acao OPORTUNIDADE_ESTADO_ALTERADO, motivo
      // "DOCUMENTACAO_CONCLUIDA->FECHADA") - não duplicada aqui.
      const atualizada = await this.moverEstagioTx(tx, tenantId, oportunidadeId, 'FECHADA', usuarioId);

      const imovel = await tx.imovel.findFirst({ where: { id: oportunidade.imovelId, tenantId } });
      if (!imovel) {
        throw new BadRequestException('Imóvel da oportunidade não encontrado.');
      }

      // RN-309 / CA-002 (US-020): "imóvel de unidade diferente" = unidade
      // proprietária do imóvel diferente da unidade do lead que gerou a
      // venda. NÃO calcula valor de comissão (DEC-NEG-002 pendente) - só
      // registra que o gatilho foi acionado.
      if (imovel.unidadeProprietariaId !== lead.unidadeId) {
        await tx.comissaoCruzadaAcionada.create({
          data: {
            tenantId,
            oportunidadeId,
            unidadeProprietariaImovelId: imovel.unidadeProprietariaId,
            unidadeResponsavelLeadId: lead.unidadeId,
          },
        });
      }

      return paraOportunidade(atualizada);
    });
  }

  async listarComissoesCruzadas(tenantId: string, oportunidadeId: string): Promise<ComissaoCruzadaAcionada[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.comissaoCruzadaAcionada.findMany({
        where: { tenantId, oportunidadeId },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraComissaoCruzada);
    });
  }
}
