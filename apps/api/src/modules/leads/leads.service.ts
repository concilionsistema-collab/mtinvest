import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Lead as LeadRecord, InteracaoDeLead as InteracaoRecord, Prisma } from '@prisma/client';
import { CapturarLeadInput, CapturarLeadResultado, Lead, InteracaoDeLead, RegistrarInteracaoInput } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

/** RN-004 (ART-004): janela de exclusividade - hipótese de trabalho até DEC-NEG-001 ser aprovada. */
const JANELA_EXCLUSIVIDADE_HORAS = 48;

/** RN-004/DEC-NEG-011 (ART-004): prazo de inatividade sugerido em DEC-NEG-011, ainda não aprovado. */
const DIAS_INATIVIDADE_PARA_INATIVO = 180;

function normalizar(valor: string | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, '');
  return digitos.length > 0 ? digitos : null;
}

function paraLead(registro: LeadRecord): Lead {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    unidadeId: registro.unidadeId,
    pessoaId: registro.pessoaId,
    responsavelUsuarioId: registro.responsavelUsuarioId,
    estado: registro.estado,
    janelaExclusividadeFim: registro.janelaExclusividadeFim
      ? registro.janelaExclusividadeFim.toISOString()
      : null,
    origemCanal: registro.origemCanal,
    finalidadeDesejada: registro.finalidadeDesejada,
    orcamentoMinimo: registro.orcamentoMinimo ? registro.orcamentoMinimo.toNumber() : null,
    orcamentoMaximo: registro.orcamentoMaximo ? registro.orcamentoMaximo.toNumber() : null,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

function paraInteracao(registro: InteracaoRecord): InteracaoDeLead {
  return {
    id: registro.id,
    leadId: registro.leadId,
    usuarioId: registro.usuarioId,
    tipo: registro.tipo,
    qualificado: registro.qualificado,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // US-007 (ART-014) / RN-003 (ART-004): deduplica por telefone/documento
  // normalizado antes de criar lead. Encontrando pessoa com lead ativo (nao
  // convertido): se o lead estiver INATIVO, reativa (US-009); caso
  // contrario, a captura e tratada como duplicidade simples, sem criar lead
  // novo. Sem correspondencia, cria Pessoa + Lead e distribui imediatamente
  // (RN-002/RN-004).
  // PENDENCIA DE README FECHADA (CA-002: atomicidade sob concorrencia):
  // capturarTx ja e protegida por constraint unica no banco (Pessoa,
  // migration pessoa_unique_documento_telefone) - a corrida so podia ser
  // fechada la, nao em codigo de aplicacao (o SELECT de uma transacao nunca
  // enxerga o INSERT de outra ainda nao commitada, nao importa a logica).
  // Quando duas capturas do mesmo contato colidem, a "perdedora" recebe
  // P2002 (violacao) e sua transacao inteira ja foi abortada pelo Postgres -
  // nao da pra so re-tentar uma query dentro dela. Por isso o retry aqui
  // refaz a operacao inteira UMA vez; da segunda vez o SELECT ja enxerga a
  // Pessoa que a vencedora commitou, e o fluxo segue como duplicidade normal.
  async capturar(tenantId: string, input: CapturarLeadInput): Promise<CapturarLeadResultado> {
    try {
      return await this.capturarTx(tenantId, input);
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return this.capturarTx(tenantId, input);
      }
      throw erro;
    }
  }

  private async capturarTx(tenantId: string, input: CapturarLeadInput): Promise<CapturarLeadResultado> {
    const telefoneNormalizado = normalizar(input.telefone);
    const documentoNormalizado = normalizar(input.documento);

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const unidade = await tx.unidade.findFirst({ where: { id: input.unidadeId, tenantId } });
      if (!unidade) {
        throw new BadRequestException('A unidade informada não existe ou não pertence a este tenant.');
      }

      await this.marcarInativosPorFaltaDeAtividade(tx, tenantId);

      let pessoa =
        documentoNormalizado || telefoneNormalizado
          ? await tx.pessoa.findFirst({
              where: {
                tenantId,
                OR: [
                  documentoNormalizado ? { documentoNormalizado } : undefined,
                  telefoneNormalizado ? { telefoneNormalizado } : undefined,
                ].filter((clausula): clausula is NonNullable<typeof clausula> => Boolean(clausula)),
              },
            })
          : null;

      if (pessoa) {
        const leadAtivo = await tx.lead.findFirst({
          where: { tenantId, pessoaId: pessoa.id, estado: { not: 'CONVERTIDO' } },
          orderBy: { criadoEm: 'desc' },
        });

        if (leadAtivo?.estado === 'INATIVO') {
          // US-009 / CA-001 (ART-014): recontato fora da janela reabre o
          // lead inativo e o coloca de volta na fila de distribuicao -
          // nunca cria lead novo para o mesmo historico.
          const reaberto = await tx.lead.update({
            where: { id: leadAtivo.id },
            data: { estado: 'EM_FILA_DE_DISTRIBUICAO' },
          });
          const distribuido = await this.distribuirLead(tx, tenantId, reaberto);
          return { lead: paraLead(distribuido), duplicidadeDetectada: false, reativado: true };
        }

        if (leadAtivo) {
          // RN-003: entrada duplicada e anexada ao lead existente - nenhum
          // lead/pessoa novo e criado. Registro da interacao de recontato
          // fica a cargo de quem efetivamente atender (ver registrarInteracao),
          // nao ha "autor" humano neste evento automatico de captura.
          return { lead: paraLead(leadAtivo), duplicidadeDetectada: true, reativado: false };
        }
      } else {
        pessoa = await tx.pessoa.create({
          data: { tenantId, tipo: 'FISICA', nome: input.nomeContato, telefoneNormalizado, documentoNormalizado },
        });
      }

      const criado = await tx.lead.create({
        data: {
          tenantId,
          unidadeId: input.unidadeId,
          pessoaId: pessoa.id,
          origemCanal: input.origemCanal,
          estado: 'EM_FILA_DE_DISTRIBUICAO',
          finalidadeDesejada: input.finalidadeDesejada,
          orcamentoMinimo: input.orcamentoMinimo,
          orcamentoMaximo: input.orcamentoMaximo,
        },
      });

      const distribuido = await this.distribuirLead(tx, tenantId, criado);
      return { lead: paraLead(distribuido), duplicidadeDetectada: false, reativado: false };
    });
  }

  // US-008 (ART-014) / RN-004 (ART-004): distribuicao round-robin simples -
  // escolhe, entre os usuarios ATIVOS da unidade, quem recebeu um lead ha
  // mais tempo (ou nunca recebeu). Sem usuario ativo na unidade, o lead
  // permanece em fila (nao ha erro, e o comportamento esperado). Publico
  // porque US-010 (transferencia de carteira, ver UsuariosService.desligar)
  // reaproveita a mesma regra de distribuicao.
  // ATUALIZADO (ator sistema, ver RegistroDeAuditoria/SchedulerService):
  // gera RegistroDeAuditoria sempre - atorUsuarioId nulo (default) quando
  // chamada por capturar()/reabrirVencidos() (sem ator humano, evento de
  // sistema), ou o ator real quando chamada por UsuariosService.desligar()
  // (que passa o gestor que desligou o usuario). Fecha a pendencia antes
  // registrada aqui ("este projeto nao modela um ator sistema").
  async distribuirLead(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lead: LeadRecord,
    atorUsuarioId: string | null = null,
  ): Promise<LeadRecord> {
    const candidatos = await tx.usuario.findMany({
      where: { tenantId, unidadeId: lead.unidadeId, status: 'ATIVO' },
    });
    if (candidatos.length === 0) {
      return lead;
    }

    let escolhido = candidatos[0];
    let escolhidoUltimoLead: Date | null = null;
    for (const candidato of candidatos) {
      const ultimoLead = await tx.lead.findFirst({
        where: { tenantId, responsavelUsuarioId: candidato.id },
        orderBy: { criadoEm: 'desc' },
        select: { criadoEm: true },
      });
      const dataUltimoLead = ultimoLead?.criadoEm ?? null;
      if (escolhidoUltimoLead === null && dataUltimoLead === null) {
        escolhido = candidato;
        break;
      }
      if (dataUltimoLead === null || (escolhidoUltimoLead !== null && dataUltimoLead < escolhidoUltimoLead)) {
        escolhido = candidato;
        escolhidoUltimoLead = dataUltimoLead;
      }
    }

    const janelaExclusividadeFim = new Date(Date.now() + JANELA_EXCLUSIVIDADE_HORAS * 60 * 60 * 1000);
    const distribuido = await tx.lead.update({
      where: { id: lead.id },
      data: { responsavelUsuarioId: escolhido.id, estado: 'DISTRIBUIDO', janelaExclusividadeFim },
    });

    await this.auditoriaService.registrarTx(
      tx,
      tenantId,
      atorUsuarioId,
      'LEAD_ESTADO_ALTERADO',
      'Lead',
      lead.id,
      `${lead.estado}->DISTRIBUIDO (responsavel=${escolhido.id}, RN-004)`,
    );

    return distribuido;
  }

  // US-008 / CA-002 (ART-014) / RN-004 (ART-004): reabre automaticamente
  // leads cuja janela de exclusividade venceu sem contato qualificado.
  // Roda tanto "preguicosamente" (chamada a cada listagem/captura, para
  // consistencia imediata) quanto via SchedulerService (varredura agendada
  // real, ver executarVarreduraAutomaticaTx) - o mesmo metodo cobre os dois
  // caminhos, entao a transicao e auditada nao importa qual deles a pegou
  // primeiro. ATUALIZADO: gera RegistroDeAuditoria com atorUsuarioId nulo
  // (ator sistema) - fecha a lacuna antes registrada aqui ("sem conceito de
  // ator sistema nesta fatia").
  private async reabrirVencidos(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const vencidos = await tx.lead.findMany({
      where: { tenantId, estado: 'DISTRIBUIDO', janelaExclusividadeFim: { lt: new Date() } },
    });
    for (const lead of vencidos) {
      const reaberto = await tx.lead.update({
        where: { id: lead.id },
        data: { estado: 'EM_FILA_DE_DISTRIBUICAO', responsavelUsuarioId: null, janelaExclusividadeFim: null },
      });
      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        null,
        'LEAD_ESTADO_ALTERADO',
        'Lead',
        lead.id,
        'DISTRIBUIDO->EM_FILA_DE_DISTRIBUICAO (janela de exclusividade vencida, RN-004)',
      );
      await this.distribuirLead(tx, tenantId, reaberto);
    }
  }

  // US-009 (ART-014) / ART-004, secao 8.1: "Em atendimento -> Inativo:
  // inatividade > N dias". Usa a interacao mais recente do lead (ou a data
  // de criacao, se nunca houve interacao) como referencia de "ultima
  // atividade". Mesma nota de reabrirVencidos sobre os dois caminhos
  // (preguicoso + SchedulerService) e auditoria com ator sistema (null).
  private async marcarInativosPorFaltaDeAtividade(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const emAtendimento = await tx.lead.findMany({ where: { tenantId, estado: 'EM_ATENDIMENTO' } });
    const limite = new Date(Date.now() - DIAS_INATIVIDADE_PARA_INATIVO * 24 * 60 * 60 * 1000);

    for (const lead of emAtendimento) {
      const ultimaInteracao = await tx.interacaoDeLead.findFirst({
        where: { tenantId, leadId: lead.id },
        orderBy: { criadoEm: 'desc' },
        select: { criadoEm: true },
      });
      const ultimaAtividade = ultimaInteracao?.criadoEm ?? lead.criadoEm;
      if (ultimaAtividade < limite) {
        await tx.lead.update({ where: { id: lead.id }, data: { estado: 'INATIVO' } });
        await this.auditoriaService.registrarTx(
          tx,
          tenantId,
          null,
          'LEAD_ESTADO_ALTERADO',
          'Lead',
          lead.id,
          `EM_ATENDIMENTO->INATIVO (sem atividade ha mais de ${DIAS_INATIVIDADE_PARA_INATIVO} dias, US-009)`,
        );
      }
    }
  }

  // SchedulerService (jobs reais - README, "Próximos passos sugeridos"):
  // ponto de entrada unico para a varredura agendada deste modulo, reaproveita
  // exatamente a mesma logica/auditoria da checagem preguicosa acima.
  async executarVarreduraAutomaticaTx(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await this.reabrirVencidos(tx, tenantId);
    await this.marcarInativosPorFaltaDeAtividade(tx, tenantId);
  }

  // PENDENCIA DE README FECHADA ("Próximos passos sugeridos", item 1): antes,
  // qualquer usuário autenticado do tenant listava leads de qualquer unidade.
  // Regra 4 de perfis-e-permissoes.md ("usuário de uma unidade não acessa
  // outra sem regra explícita") + linha "Lead próprio"/"Operar unidade" da
  // tabela de permissões - GESTOR_UNIDADE e CORRETOR veem a mesma unidade
  // (a própria), não distingui "só meus leads" para CORRETOR porque a tela
  // atual (leads/page.tsx) já mostra o responsável de cada lead e depende de
  // ver a fila/leads de colegas para dar contexto ao gestor e ao corretor.
  async listar(tenantId: string, unidadeId: string): Promise<Lead[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      await this.reabrirVencidos(tx, tenantId);
      await this.marcarInativosPorFaltaDeAtividade(tx, tenantId);
      const registros = await tx.lead.findMany({ where: { tenantId, unidadeId }, orderBy: { criadoEm: 'asc' } });
      return registros.map(paraLead);
    });
  }

  // RN-004 (ART-004): contato qualificado dentro da janela encerra a
  // exclusividade temporal e move o lead para "Em atendimento".
  // SEGURANCA: quem registra e sempre o usuario autenticado (usuarioId
  // deixou de vir do body - ver comentario em RegistrarInteracaoInput). Sem
  // essa correcao, qualquer usuario autenticado do tenant podia registrar
  // interacoes "como" outro usuario so informando o ID certo no corpo.
  async registrarInteracao(
    tenantId: string,
    leadId: string,
    input: RegistrarInteracaoInput,
    usuarioId: string,
  ): Promise<InteracaoDeLead> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId } });
      if (!lead) {
        throw new NotFoundException('Lead não encontrado neste tenant.');
      }

      const interacao = await tx.interacaoDeLead.create({
        data: {
          tenantId,
          leadId,
          usuarioId,
          tipo: input.tipo,
          qualificado: input.qualificado ?? false,
        },
      });

      if (input.qualificado && lead.estado === 'DISTRIBUIDO') {
        await tx.lead.update({
          where: { id: leadId },
          data: { estado: 'EM_ATENDIMENTO', janelaExclusividadeFim: null },
        });

        // ART-005, secao 9: escrita em Lead.estado gera RegistroDeAuditoria.
        // Aqui ha um ator humano real (quem registrou a interacao), ao
        // contrario da distribuicao/reabertura automatica (ver distribuirLead).
        await this.auditoriaService.registrarTx(
          tx,
          tenantId,
          usuarioId,
          'LEAD_ESTADO_ALTERADO',
          'Lead',
          leadId,
          'DISTRIBUIDO->EM_ATENDIMENTO',
        );
      }

      return paraInteracao(interacao);
    });
  }
}
