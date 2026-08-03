/** Espelha a entidade Reserva de ART-005, secao 3 (RN-307, ART-009). */
export type ReservaEstado = 'ATIVA' | 'EXPIRADA' | 'CONVERTIDA' | 'CANCELADA';

export interface Reserva {
  id: string;
  tenantId: string;
  oportunidadeId: string;
  propostaId: string;
  estado: ReservaEstado;
  expiraEm: string;
  criadoEm: string;
}

// usuarioId NAO faz parte do input: quem formaliza e sempre quem esta
// autenticado (CurrentUsuario), nunca um valor enviado pelo cliente.
export interface FormalizarReservaInput {
  propostaId: string;
}
