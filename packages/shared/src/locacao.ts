// ART-010 (Locação operacional, Fase 2). Ver ART-015-backlog-fase-2.md.

export type ContratoDeAdministracaoStatus = 'ATIVO' | 'ENCERRADO';

export interface ContratoDeAdministracao {
  id: string;
  tenantId: string;
  unidadeId: string;
  imovelId: string;
  proprietarioPessoaId: string;
  status: ContratoDeAdministracaoStatus;
  criadoEm: string;
}

export interface CriarContratoDeAdministracaoInput {
  unidadeId: string;
  imovelId: string;
  proprietarioPessoaId: string;
}

/**
 * ART-010, seção 8.1 — 7 estados do ciclo de vida. Nesta fatia (US-102) só
 * RASCUNHO é alcançável via API; os demais existem no tipo para não exigir
 * mudança de contrato quando as transições (US-106 em diante) forem
 * implementadas.
 */
export type ContratoDeLocacaoEstado =
  | 'RASCUNHO'
  | 'EM_ASSINATURA'
  | 'AGUARDANDO_VISTORIA_ENTRADA'
  | 'VIGENTE'
  | 'EM_ENCERRAMENTO'
  | 'EM_ENCERRAMENTO_ANTECIPADO'
  | 'ENCERRADO';

/** DEC-NEG-015 (pendente): catálogo simplificado, hipótese de trabalho. */
export type IndiceReajuste = 'IGPM' | 'IPCA' | 'OUTRO';

export interface ContratoDeLocacao {
  id: string;
  tenantId: string;
  contratoDeAdministracaoId: string;
  inquilinoPessoaId: string;
  estado: ContratoDeLocacaoEstado;
  valorAluguel: number;
  diaVencimento: number;
  indiceReajuste: IndiceReajuste;
  aceitaReajusteNegativo: boolean;
  /** RN-402: se true, o contrato não vira VIGENTE sem uma Garantia ATIVA vinculada. */
  exigeGarantia: boolean;
  dataInicio: string;
  prazoMeses: number;
  criadoEm: string;
}

export interface CriarContratoDeLocacaoInput {
  contratoDeAdministracaoId: string;
  inquilinoPessoaId: string;
  valorAluguel: number;
  diaVencimento: number;
  indiceReajuste: IndiceReajuste;
  aceitaReajusteNegativo: boolean;
  exigeGarantia: boolean;
  dataInicio: string;
  prazoMeses: number;
}

/** DEC-NEG-014 (pendente): catálogo simplificado, hipótese de trabalho. */
export type GarantiaTipo = 'FIADOR' | 'CAUCAO' | 'SEGURO_FIANCA';

/**
 * ART-010, seção 8.2 — 5 estados. EM_SUBSTITUICAO só existe na garantia
 * antiga durante uma troca (RN-403); a nova nasce em EM_ANALISE.
 */
export type GarantiaEstado = 'EM_ANALISE' | 'ATIVA' | 'EM_SUBSTITUICAO' | 'EM_LIQUIDACAO' | 'ENCERRADA';

export interface Garantia {
  id: string;
  tenantId: string;
  contratoDeLocacaoId: string;
  tipo: GarantiaTipo;
  estado: GarantiaEstado;
  fiadorPessoaId: string | null;
  substituiGarantiaId: string | null;
  criadoEm: string;
}

export interface RegistrarGarantiaInput {
  tipo: GarantiaTipo;
  /** Obrigatório quando tipo = FIADOR, ignorado nos demais. */
  fiadorPessoaId?: string;
}

/**
 * ART-010, seção 8.3 — 5 estados. Nesta fatia (US-106) só o fluxo de
 * ENTRADA é implementado (AGENDADA → REALIZADA aciona RN-404); contestação
 * (CONFIRMADA/EM_CONTESTACAO/RETIFICADA) é específica de SAIDA (US-107).
 */
export type VistoriaTipo = 'ENTRADA' | 'SAIDA';
export type VistoriaEstado = 'AGENDADA' | 'REALIZADA' | 'CONFIRMADA' | 'EM_CONTESTACAO' | 'RETIFICADA';

export interface Vistoria {
  id: string;
  tenantId: string;
  contratoDeLocacaoId: string;
  tipo: VistoriaTipo;
  estado: VistoriaEstado;
  dataHora: string;
  laudo: string | null;
  evidencias: string | null;
  realizadaEm: string | null;
  criadoEm: string;
}

export interface AgendarVistoriaInput {
  contratoDeLocacaoId: string;
  tipo: VistoriaTipo;
  dataHora: string;
}

export interface RealizarLaudoVistoriaInput {
  laudo: string;
  /** Texto livre (URL/descrição) — sem upload de arquivo real nesta fatia. */
  evidencias?: string;
}
