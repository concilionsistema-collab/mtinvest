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
  /** US-109/RN-408: vencimento do período vigente — estendido a cada renovação confirmada. */
  vencimentoAtual: string;
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
 * ART-010, seção 8.3 — 5 estados. US-106 implementou o fluxo de ENTRADA
 * (AGENDADA → REALIZADA aciona RN-404); US-107 implementa a contestação
 * (CONFIRMADA/EM_CONTESTACAO/RETIFICADA), exclusiva de SAIDA.
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
  /** US-107 (RN-405/TEST-403): quem registrou o laudo — nunca pode decidir a própria contestação. */
  realizadoPorUsuarioId: string | null;
  /** US-107 (DEC-NEG-016): prazo formal de contestação, só preenchido para vistoria de SAIDA. */
  prazoContestacaoAte: string | null;
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

/** ART-010, seção 12/8.3 — RN-405, DEC-NEG-016. */
export type ContestacaoDecisao = 'CONFIRMADA' | 'RETIFICADA';

export interface ContestacaoDeVistoria {
  id: string;
  tenantId: string;
  vistoriaId: string;
  motivo: string;
  evidencia: string | null;
  contestadoPorUsuarioId: string;
  analistaUsuarioId: string | null;
  decisao: ContestacaoDecisao | null;
  justificativaDecisao: string | null;
  criadoEm: string;
  decididoEm: string | null;
}

export interface RegistrarContestacaoInput {
  motivo: string;
  /** Texto livre (URL/descrição) — DEC-NEG-016 exige evidência obrigatória. */
  evidencia: string;
}

export interface DecidirContestacaoInput {
  decisao: ContestacaoDecisao;
  justificativaDecisao: string;
}

/**
 * ART-010, seção 12 — US-108, RN-406/RN-407. DEC-NEG-015 (pendente, "Opção
 * C" — recomendação técnica): valor do índice capturado manualmente por
 * competência, versionado (nunca recalculado retroativamente).
 */
export interface Reajuste {
  id: string;
  tenantId: string;
  contratoDeLocacaoId: string;
  /** Formato "AAAA-MM". */
  competencia: string;
  indice: IndiceReajuste;
  percentualIndice: number;
  /** RN-407: pode diferir de percentualIndice quando negativo e o contrato não aceitar reajuste negativo (piso zero). */
  percentualAplicado: number;
  valorAluguelAnterior: number;
  valorAluguelNovo: number;
  criadoEm: string;
}

export interface AplicarReajusteInput {
  /** Formato "AAAA-MM". */
  competencia: string;
  /** Valor do índice para a competência, em percentual (ex.: 0.53 = 0,53%). Pode ser negativo (deflação). */
  percentualIndice: number;
}

/**
 * ART-010, seção 12 — US-109/US-110, RN-408/RN-409/RN-412. DEC-NEG-015
 * (pendente, "Opção C" — recomendação técnica): renovação nunca é
 * automática, sempre exige confirmação humana registrada; cada confirmação
 * gera uma linha (vínculo ao período anterior e ao novo), estendendo
 * ContratoDeLocacao.vencimentoAtual.
 */
export interface Renovacao {
  id: string;
  tenantId: string;
  contratoDeLocacaoId: string;
  prazoAdicionalMeses: number;
  vencimentoAnterior: string;
  novoVencimento: string;
  confirmadoPorUsuarioId: string;
  criadoEm: string;
}

export interface ConfirmarRenovacaoInput {
  prazoAdicionalMeses: number;
}

/**
 * ART-010, seção 12 — US-112, RN-411. SIMPLIFICAÇÃO REGISTRADA: mesma
 * decisão de `Vistoria.evidencias` — `referencia` é texto livre (URL/
 * descrição de onde o documento real está guardado), sem upload de arquivo
 * nesta fatia (armazenamento real ainda "a definir" em ART-012).
 */
export type DocumentoDeContratoTipo =
  | 'CONTRATO_ASSINADO'
  | 'LAUDO_VISTORIA'
  | 'COMPROVANTE_GARANTIA'
  | 'TERMO_RENOVACAO'
  | 'TERMO_RESCISAO'
  | 'OUTRO';

export interface DocumentoDeContrato {
  id: string;
  tenantId: string;
  contratoDeLocacaoId: string;
  tipo: DocumentoDeContratoTipo;
  descricao: string;
  referencia: string;
  anexadoPorUsuarioId: string;
  criadoEm: string;
}

export interface AnexarDocumentoInput {
  tipo: DocumentoDeContratoTipo;
  descricao: string;
  referencia: string;
}

/**
 * ART-010, seção 12/17 — US-113, RN-413. DECISÃO TÉCNICA REGISTRADA: nenhum
 * artefato especifica autenticação de `Pessoa` (proprietário/inquilino nunca
 * fazem login como `Usuario`) — o portal é acessado por um token opaco de
 * alta entropia, gerado por um `GESTOR_UNIDADE` e entregue fora da banda
 * (sem e-mail/SMS real nesta fatia). Mesmo padrão de segurança do refresh
 * token: só o hash fica armazenado, o valor puro é retornado uma única vez.
 */
export interface AcessoPortalContrato {
  id: string;
  tenantId: string;
  contratoDeLocacaoId: string;
  pessoaId: string;
  criadoPorUsuarioId: string;
  revogadoEm: string | null;
  criadoEm: string;
}

export interface GerarAcessoPortalInput {
  /** Precisa ser o proprietário (via contrato de administração) ou o inquilino deste contrato — RN-413. */
  pessoaId: string;
}

export interface GerarAcessoPortalResultado extends AcessoPortalContrato {
  /** Valor puro do token — retornado só nesta resposta, nunca mais recuperável (só o hash é persistido). */
  token: string;
}

/**
 * ART-010, seção 12 — US-111, RN-410/CA-405. DEC-NEG-017 (pendente, "Opção
 * C" — recomendação técnica, "não é afirmação jurídica"): multa
 * proporcional ao tempo restante. **BLOQUEADO PARA PRODUÇÃO REAL** até
 * validação jurídica formal (ART-010 §21) — a API recusa qualquer chamada
 * a menos que `LOCACAO_MULTA_RESCISORIA_HABILITADA=true` esteja definido no
 * ambiente do servidor. Exercício técnico documentado, não funcionalidade
 * liberada.
 */
export interface EncerramentoAntecipado {
  id: string;
  tenantId: string;
  contratoDeLocacaoId: string;
  valorReferencia: number;
  mesesRestantes: number;
  mesesTotais: number;
  percentualProporcional: number;
  valorMulta: number;
  isento: boolean;
  motivoIsencao: string | null;
  confirmadoPorUsuarioId: string;
  criadoEm: string;
}

export interface SolicitarEncerramentoAntecipadoInput {
  isento?: boolean;
  /** Obrigatório quando isento = true — apuração formal (RN-410), nunca informal. */
  motivoIsencao?: string;
}

/**
 * RN-413: portal é somente consulta — nenhum campo aqui permite mutação.
 * `Omit<..., 'anexadoPorUsuarioId'|'realizadoPorUsuarioId'>`: identificadores
 * internos de `Usuario` (staff da imobiliária) não têm utilidade legítima
 * pro proprietário/inquilino externo — correção de segurança registrada,
 * revisão de 2026-08-08 (evita disclosure desnecessário de ID interno pra
 * quem só tem um token, sem autenticação nenhuma).
 */
export interface PortalContratoResumo {
  contratoDeLocacaoId: string;
  enderecoImovel: string;
  estado: ContratoDeLocacaoEstado;
  valorAluguel: number;
  diaVencimento: number;
  indiceReajuste: IndiceReajuste;
  vencimentoAtual: string;
  documentos: Omit<DocumentoDeContrato, 'anexadoPorUsuarioId'>[];
  vistorias: Omit<Vistoria, 'realizadoPorUsuarioId'>[];
  reajustes: Reajuste[];
  renovacoes: Renovacao[];
}
