/** Espelha a entidade Visita de ART-005, secao 3 (RN-303/RN-304, ART-009). */
export type VisitaEstado = 'AGENDADA' | 'CONFIRMADA' | 'REALIZADA' | 'CANCELADA';

export type VisitaResultado =
  | 'INTERESSADO'
  | 'NAO_INTERESSADO'
  | 'INTERESSADO_EM_OUTRO_IMOVEL'
  | 'NAO_COMPARECEU';

export interface Visita {
  id: string;
  tenantId: string;
  oportunidadeId: string;
  dataHora: string;
  estado: VisitaEstado;
  resultado: VisitaResultado | null;
  criadoEm: string;
  /** Calculado no backend (US-014, CA-002) - simplificação sem agendador real, ver README de sistema/. */
  precisaAlerta: boolean;
}

// usuarioId NAO faz parte do input: quem agenda e sempre quem esta
// autenticado (CurrentUsuario), nunca um valor enviado pelo cliente.
export interface AgendarVisitaInput {
  oportunidadeId: string;
  dataHora: string;
}

export interface RealizarVisitaInput {
  resultado: VisitaResultado;
}
