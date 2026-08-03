/** Espelha a entidade Proposta de ART-005, secao 3 (RN-305/RN-306, ART-009). */
export type PropostaTipo = 'INICIAL' | 'CONTRAPROPOSTA';
export type PropostaStatus = 'ENVIADA' | 'ACEITA' | 'RECUSADA';

export interface Proposta {
  id: string;
  tenantId: string;
  oportunidadeId: string;
  tipo: PropostaTipo;
  valor: number;
  condicoes: string;
  status: PropostaStatus;
  aprovadorUsuarioId: string | null;
  criadoEm: string;
}

// usuarioId (quem registra) NAO faz parte destes inputs - e sempre quem
// esta autenticado (CurrentUsuario). aprovadorUsuarioId e diferente: referencia
// uma OUTRA pessoa (o aprovador do desconto), por isso continua explícito.
/** US-016 (ART-014) / RN-305 (ART-009): valor e condições sempre explícitos. */
export interface RegistrarPropostaInput {
  valor: number;
  condicoes: string;
}

/** US-017 (ART-014) / RN-306 (ART-009): aprovadorUsuarioId só é exigido quando o desconto excede a faixa pré-autorizada. */
export interface RegistrarContrapropostaInput {
  valor: number;
  condicoes: string;
  aprovadorUsuarioId?: string;
}
