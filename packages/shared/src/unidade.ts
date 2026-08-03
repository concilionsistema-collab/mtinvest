/**
 * Espelha a entidade Unidade de ART-005, secao 3.
 * RN-001 (ART-004): unidade pertence a exatamente um tenant.
 */
export type UnidadeStatus = 'ATIVA' | 'INATIVA';

export interface Unidade {
  id: string;
  tenantId: string;
  nomeFantasia: string;
  status: UnidadeStatus;
  eMatriz: boolean;
  criadoEm: string;
}

export interface CriarUnidadeInput {
  nomeFantasia: string;
  eMatriz?: boolean;
}
