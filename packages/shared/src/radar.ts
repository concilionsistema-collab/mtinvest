import { Imovel } from './imovel';

/**
 * RN-316 (ART-009), US-022 (ART-014): decisão humana sobre uma sugestão do
 * radar. O radar NUNCA cria Oportunidade sozinho — só existe registro após
 * o corretor aceitar ou recusar explicitamente uma sugestão.
 */
export type SugestaoRadarStatus = 'ACEITA' | 'RECUSADA';

export interface SugestaoRadar {
  id: string;
  tenantId: string;
  leadId: string;
  imovelId: string;
  status: SugestaoRadarStatus;
  usuarioId: string;
  criadoEm: string;
}

/** Sugestão computada sob demanda (não persistida) — vira SugestaoRadar só quando decidida. */
export interface SugestaoImovel {
  imovel: Imovel;
  decisao: SugestaoRadarStatus | null;
}

// usuarioId NAO faz parte do input: quem decide e sempre quem esta
// autenticado (CurrentUsuario), nunca um valor enviado pelo cliente.
export interface DecidirSugestaoInput {
  status: SugestaoRadarStatus;
}
