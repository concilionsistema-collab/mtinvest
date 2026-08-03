/** Espelha a entidade Tenant de ART-005 (Modelo de Dados Nuclear), secao 3. */
export type TenantStatus = 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';

export interface Tenant {
  id: string;
  razaoSocial: string;
  status: TenantStatus;
  criadoEm: string;
}
