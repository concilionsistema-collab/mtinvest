/** Espelha ChecklistDocumental de ART-005, seção 3, e RN-308 (ART-009). */
export interface ChecklistDocumentoItem {
  id: string;
  tenantId: string;
  oportunidadeId: string;
  descricao: string;
  obrigatorio: boolean;
  concluido: boolean;
  criadoEm: string;
}

export interface ConcluirChecklistItemInput {
  concluido: boolean;
}

/**
 * RN-309 (ART-009): registro de que a comissão cruzada foi acionada ao
 * fechar uma oportunidade cujo imóvel pertence a outra unidade. NÃO é um
 * cálculo de valor de comissão — a tabela-padrão de comissionamento depende
 * de DEC-NEG-002, ainda não aprovada. É só o gatilho/registro do evento.
 */
export interface ComissaoCruzadaAcionada {
  id: string;
  tenantId: string;
  oportunidadeId: string;
  unidadeProprietariaImovelId: string;
  unidadeResponsavelLeadId: string;
  criadoEm: string;
}
