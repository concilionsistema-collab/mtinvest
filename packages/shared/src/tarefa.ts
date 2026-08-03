// EXTENSAO REGISTRADA (fora de ART-005): lembrete/follow-up manual do
// usuario ("Tarefas" no menu). Sem escopo formal em nenhum artefato - ver
// comentario completo em prisma/schema.prisma, model Tarefa. Sempre pessoal
// (dono = quem criou), nao ha atribuicao a outro usuario nesta fatia.
export interface Tarefa {
  id: string;
  tenantId: string;
  usuarioId: string;
  titulo: string;
  concluida: boolean;
  prazo: string | null;
  criadoEm: string;
}

export interface CriarTarefaInput {
  titulo: string;
  prazo?: string | null;
}
