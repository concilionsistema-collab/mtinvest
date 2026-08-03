/** Espelha a entidade Pessoa de ART-005, secao 3. */
export type PessoaTipo = 'FISICA' | 'JURIDICA';

export interface Pessoa {
  id: string;
  tenantId: string;
  tipo: PessoaTipo;
  nome: string;
  documentoNormalizado: string | null;
  criadoEm: string;
}

export interface CriarPessoaInput {
  tipo: PessoaTipo;
  nome: string;
  documentoNormalizado?: string;
}
