/** Espelha a entidade Oportunidade de ART-005, secao 3, e os estados da secao 8.1 de ART-009. */
export type OportunidadeEstado =
  | 'QUALIFICACAO'
  | 'VISITA_AGENDADA'
  | 'VISITA_CONFIRMADA'
  | 'VISITA_REALIZADA'
  | 'PROPOSTA_ENVIADA'
  | 'EM_CONTRAPROPOSTA'
  | 'RESERVA'
  | 'DOCUMENTACAO_CONCLUIDA'
  | 'FECHADA'
  | 'PERDIDA';

export interface Oportunidade {
  id: string;
  tenantId: string;
  leadId: string;
  imovelId: string;
  estado: OportunidadeEstado;
  criadoEm: string;
}

// usuarioId NAO faz parte destes inputs: quem age e sempre quem esta
// autenticado (CurrentUsuario), nunca um valor enviado pelo cliente - ver
// JwtAuthGuard/CurrentUsuario(). RN-301 (ART-009): vincula-se a exatamente
// um lead e um imóvel.
export interface CriarOportunidadeInput {
  leadId: string;
  imovelId: string;
}

export interface MoverOportunidadeInput {
  estadoDestino: OportunidadeEstado;
}

// registrarTentativaDeContato e fechar nao tem mais input de corpo - quem
// registra/fecha e sempre CurrentUsuario(), e os demais dados vem da rota
// (tenantId, oportunidadeId).
