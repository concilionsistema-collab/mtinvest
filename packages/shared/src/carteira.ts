/**
 * RN-008/RN-009 (ART-004), US-010 (ART-014): transferência de carteira de
 * lead ao desligamento/afastamento do responsável. Item sem estágio
 * avançado é transferido automaticamente (ver UsuariosService.desligar,
 * nunca passa por aqui). Item em estágio avançado (RN-009) fica PENDENTE
 * até o gestor decidir o destino ou o SLA vencer (ESCALADA_MATRIZ).
 */
export type TransferenciaCarteiraEstado = 'PENDENTE' | 'TRANSFERIDA' | 'ESCALADA_MATRIZ';

export interface TransferenciaDeCarteira {
  id: string;
  tenantId: string;
  leadId: string;
  origemUsuarioId: string | null;
  destinoUsuarioId: string | null;
  estado: TransferenciaCarteiraEstado;
  motivo: string;
  slaDecisaoFim: string | null;
  criadoEm: string;
  decididoEm: string | null;
}

export interface DecidirTransferenciaInput {
  destinoUsuarioId: string;
}
