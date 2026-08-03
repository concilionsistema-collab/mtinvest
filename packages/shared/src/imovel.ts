/**
 * Espelha a entidade Imovel de ART-005, secao 3.
 * RN-005 (ART-004): unidade_proprietaria_id e imutavel exceto por
 * transferencia formal de carteira (ainda nao implementada).
 */
export type ImovelFinalidade = 'VENDA' | 'LOCACAO' | 'AMBOS';

export type ImovelEstadoCompartilhamento =
  | 'EXCLUSIVO_DA_UNIDADE'
  | 'COMPARTILHADO'
  | 'COMPARTILHADO_EM_NEGOCIACAO'
  | 'ENCERRADO';

export type ImovelEscopoCompartilhamento = 'FECHADO' | 'REDE' | 'REGIAO' | 'LISTA';

export interface Imovel {
  id: string;
  tenantId: string;
  unidadeProprietariaId: string;
  finalidade: ImovelFinalidade;
  enderecoResumo: string;
  /** DEC-NEG-013 (pendente): faixa de desconto pré-autorizada pelo proprietário na captação. */
  valorAnunciado: number | null;
  percentualDescontoPreAutorizado: number | null;
  estadoCompartilhamento: ImovelEstadoCompartilhamento;
  escopoCompartilhamento: ImovelEscopoCompartilhamento | null;
  criadoEm: string;
}

export interface CriarImovelInput {
  unidadeProprietariaId: string;
  finalidade: ImovelFinalidade;
  enderecoResumo: string;
  valorAnunciado?: number;
  percentualDescontoPreAutorizado?: number;
}

export interface CompartilharImovelInput {
  escopoCompartilhamento: ImovelEscopoCompartilhamento;
}
