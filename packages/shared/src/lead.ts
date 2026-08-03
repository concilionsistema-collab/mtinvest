import { ImovelFinalidade } from './imovel';

/**
 * Espelha a entidade Lead de ART-005, secao 3, e os estados da secao 8.1 de
 * ART-004. "Novo" nao existe como estado persistido - a deduplicacao (RN-003)
 * ocorre antes de qualquer lead ser salvo.
 */
export type LeadEstado =
  | 'EM_FILA_DE_DISTRIBUICAO'
  | 'DISTRIBUIDO'
  | 'EM_ATENDIMENTO'
  | 'INATIVO'
  | 'CONVERTIDO';

export interface Lead {
  id: string;
  tenantId: string;
  unidadeId: string;
  pessoaId: string;
  responsavelUsuarioId: string | null;
  estado: LeadEstado;
  janelaExclusividadeFim: string | null;
  origemCanal: string;
  /** EXTENSÃO (fora de ART-005 nuclear, ver US-022): preferência opcional, usada pelo radar (RN-316). */
  finalidadeDesejada: ImovelFinalidade | null;
  /** EXTENSÃO (fora de ART-005 nuclear, ver US-022): faixa de orçamento opcional, usada pelo radar (RN-316). */
  orcamentoMinimo: number | null;
  orcamentoMaximo: number | null;
  criadoEm: string;
}

/** RN-003 (ART-004): captura sempre passa por deduplicacao antes de criar lead. */
export interface CapturarLeadInput {
  unidadeId: string;
  nomeContato: string;
  telefone?: string;
  documento?: string;
  origemCanal: string;
  finalidadeDesejada?: ImovelFinalidade;
  orcamentoMinimo?: number;
  orcamentoMaximo?: number;
}

export interface CapturarLeadResultado {
  lead: Lead;
  duplicidadeDetectada: boolean;
  /** US-009 (ART-014): true quando o contato reativou um lead que estava INATIVO. */
  reativado: boolean;
}

export type InteracaoTipo = 'CONTATO' | 'VISITA' | 'PROPOSTA' | 'NOTA' | 'PAUSA';

export interface InteracaoDeLead {
  id: string;
  leadId: string;
  usuarioId: string;
  tipo: InteracaoTipo;
  qualificado: boolean;
  criadoEm: string;
}

// usuarioId NAO faz parte do input: quem registra a interacao e sempre
// quem esta autenticado (CurrentUsuario), nunca um valor enviado pelo
// cliente - ver JwtAuthGuard/CurrentUsuario().
export interface RegistrarInteracaoInput {
  tipo: InteracaoTipo;
  qualificado?: boolean;
}
