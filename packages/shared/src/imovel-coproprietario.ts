/**
 * Espelha a entidade ImovelCoproprietario de ART-005, secao 3.
 * ART-005, secao 5 (vigencia temporal): uma nova composicao fecha a
 * anterior (vigenteAte), nunca apaga - histórico preservado para calculo
 * financeiro retroativo (ART-008).
 */
export interface ImovelCoproprietario {
  id: string;
  imovelId: string;
  pessoaId: string;
  percentual: number;
  vigenteDe: string;
  vigenteAte: string | null;
}

export interface DefinirCoproprietariosItem {
  pessoaId: string;
  percentual: number;
}

/**
 * CA-001/CA-002 (ART-014, US-006): a composicao inteira e definida em uma
 * unica chamada, validada atomically - a soma dos percentuais deve ser
 * exatamente 100 antes de qualquer linha ser gravada.
 */
export interface DefinirCoproprietariosInput {
  coproprietarios: DefinirCoproprietariosItem[];
}
