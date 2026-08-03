import { OportunidadeEstado } from './oportunidade';

/**
 * US-024 (ART-014), EPIC-11 - Indicadores básicos. Sempre agregação —
 * RN-011 (ART-004): nunca expõe dado individual de lead/pessoa, só contagens.
 *
 * Sempre escopado à própria unidade de quem está logado (só GESTOR_UNIDADE
 * acessa). A visão "consolidado" (toda a rede) de RN-011, reservada a um
 * perfil "gestor da matriz", não existe nesta fatia (ver UsuarioPerfil) —
 * fica bloqueada por padrão (default-deny) até esse perfil ser modelado.
 */
export interface IndicadoresFunil {
  unidadeId: string;
  leadsDistribuidos: number;
  leadsEmAtendimento: number;
  leadsConvertidos: number;
  leadsInativos: number;
  oportunidadesPorEstagio: Record<OportunidadeEstado, number>;
  /** Contagem de leads por Lead.origemCanal (campo livre, não enum) — base da tela "Marketing". */
  leadsPorCanal: Record<string, number>;
  visitasRealizadas: number;
  propostasEnviadas: number;
  fechamentos: number;
  /**
   * Base da tela "Financeiro". vgvFechado soma Imovel.valorAnunciado das
   * oportunidades FECHADA (nunca infere valor de imóvel sem
   * valorAnunciado cadastrado). comissoesCruzadasQuantidade só conta o
   * gatilho (RN-309/ComissaoCruzadaAcionada) — não há valor de comissão
   * calculado nesta fatia (DEC-NEG-002 pendente), não fingimos precisão
   * que não existe.
   */
  vgvFechado: number;
  comissoesCruzadasQuantidade: number;
  /**
   * APROXIMAÇÃO REGISTRADA: percentual de leads que saíram da fila de
   * distribuição e alcançaram atendimento qualificado, sobre o total que
   * saiu da fila. NÃO é uma verificação exata contra o prazo original da
   * janela de exclusividade (RN-004) — o sistema não mantém histórico de
   * mudanças de janela (é sobrescrita/zerada a cada evento), então não dá
   * para reconstruir retroativamente se cada atendimento aconteceu antes ou
   * depois do prazo original. Ver RadarService — mesmo espírito de
   * documentar simplificação em vez de fingir precisão que não existe.
   */
  slaPercentualAtendidoDentroDaJanela: number;
}
