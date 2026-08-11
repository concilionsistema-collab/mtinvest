/**
 * Espelha a entidade Usuario de ART-005, secao 3.
 * `perfil` é uma EXTENSÃO REGISTRADA (US-002/US-003, ver schema.prisma) —
 * subconjunto de 2 dos 16 perfis de ART-006, os únicos que a lógica de
 * negócio já construída usa.
 */
export type UsuarioStatus = 'ATIVO' | 'AFASTADO' | 'DESLIGADO';
export type UsuarioPerfil = 'GESTOR_UNIDADE' | 'CORRETOR';

export interface Usuario {
  id: string;
  tenantId: string;
  unidadeId: string;
  nome: string;
  email: string | null;
  perfil: UsuarioPerfil;
  status: UsuarioStatus;
  criadoEm: string;
  /** Evita o front-end pedir GET /usuarios/:id/foto para quem nunca teve upload (sempre 404). */
  temFotoPerfil: boolean;
}

/** US-002: só quem já é GESTOR_UNIDADE pode conceder o perfil GESTOR_UNIDADE (CA-002). */
export interface CriarUsuarioInput {
  unidadeId: string;
  nome: string;
  email: string;
  senha: string;
  perfil?: UsuarioPerfil;
}

// EXTENSAO REGISTRADA (menu "Configurações"): troca de senha da própria
// conta do usuário logado. Sem escopo formal em nenhum artefato.
export interface AlterarSenhaInput {
  senhaAtual: string;
  novaSenha: string;
}
