/** Espelha a entidade Pessoa de ART-005, secao 3. */
export type PessoaTipo = 'FISICA' | 'JURIDICA';

export interface Pessoa {
  id: string;
  tenantId: string;
  tipo: PessoaTipo;
  nome: string;
  documentoNormalizado: string | null;
  telefoneNormalizado: string | null;
  /** ART-012 (LGPD): preenchido quando o titular pediu eliminação e os dados foram anonimizados. */
  anonimizadoEm: string | null;
  criadoEm: string;
}

export interface CriarPessoaInput {
  tipo: PessoaTipo;
  nome: string;
  documentoNormalizado?: string;
  telefoneNormalizado?: string;
}

/** ART-012 (LGPD): "direito de correção" — atualiza dados de identificação do titular. */
export interface AtualizarPessoaInput {
  nome?: string;
  documentoNormalizado?: string;
  telefoneNormalizado?: string;
}

/**
 * ART-012 (LGPD): "processo de atendimento a pedido de eliminação". Exige
 * motivo porque é uma ação irreversível e sensível — mesmo espírito de
 * outras ações que carregam justificativa nesta base (ex.: isenção de
 * multa, ART-010).
 */
export interface SolicitarEliminacaoInput {
  motivo: string;
}
