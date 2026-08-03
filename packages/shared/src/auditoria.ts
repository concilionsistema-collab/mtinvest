/**
 * Espelha a entidade RegistroDeAuditoria de ART-005, seção 3 — trilha de
 * auditoria genérica, append-only (nunca editado ou excluído).
 * atorUsuarioId nulo = evento de sistema (SchedulerService, varredura
 * agendada sem usuário humano por trás — ver comentário em schema.prisma).
 */
export interface RegistroDeAuditoria {
  id: string;
  tenantId: string;
  atorUsuarioId: string | null;
  acao: string;
  entidadeTipo: string;
  entidadeId: string;
  motivo: string | null;
  criadoEm: string;
}
