// Motor financeiro manual (livro-razao) - DEC-ARQ-006. Ver comentario
// completo em prisma/schema.prisma, model LancamentoFinanceiro.
export type LancamentoFinanceiroTipo = 'A_PAGAR' | 'A_RECEBER';

export type LancamentoFinanceiroCategoria =
  | 'COMISSAO'
  | 'ALUGUEL'
  | 'REPASSE_PROPRIETARIO'
  | 'TAXA_ADMINISTRACAO'
  | 'DESPESA_OPERACIONAL'
  | 'OUTRO';

export type LancamentoFinanceiroStatus = 'PENDENTE' | 'LIQUIDADO' | 'CANCELADO';

export interface LancamentoFinanceiro {
  id: string;
  tenantId: string;
  unidadeId: string;
  tipo: LancamentoFinanceiroTipo;
  categoria: LancamentoFinanceiroCategoria;
  descricao: string;
  valor: number;
  vencimento: string;
  status: LancamentoFinanceiroStatus;
  dataLiquidacao: string | null;
  liquidadoPorUsuarioId: string | null;
  canceladoEm: string | null;
  canceladoPorUsuarioId: string | null;
  motivoCancelamento: string | null;
  contraparte: string | null;
  pessoaId: string | null;
  oportunidadeId: string | null;
  contratoDeLocacaoId: string | null;
  observacoes: string | null;
  criadoPorUsuarioId: string;
  criadoEm: string;
}

export interface CriarLancamentoFinanceiroInput {
  tipo: LancamentoFinanceiroTipo;
  categoria: LancamentoFinanceiroCategoria;
  descricao: string;
  valor: number;
  vencimento: string;
  contraparte?: string;
  pessoaId?: string;
  oportunidadeId?: string;
  contratoDeLocacaoId?: string;
  observacoes?: string;
}

export interface AtualizarLancamentoFinanceiroInput {
  categoria?: LancamentoFinanceiroCategoria;
  descricao?: string;
  valor?: number;
  vencimento?: string;
  contraparte?: string;
  observacoes?: string;
}

export interface CancelarLancamentoFinanceiroInput {
  motivo: string;
}

export interface ResumoLancamentosFinanceiros {
  unidadeId: string;
  totalPendenteAReceber: number;
  totalPendenteAPagar: number;
  totalAtrasadoAReceber: number;
  totalAtrasadoAPagar: number;
  totalLiquidadoNoMesAReceber: number;
  totalLiquidadoNoMesAPagar: number;
}

// "Atrasado" nunca e armazenado - sempre derivado de status + vencimento.
export function lancamentoEstaAtrasado(
  lancamento: Pick<LancamentoFinanceiro, 'status' | 'vencimento'>,
): boolean {
  return lancamento.status === 'PENDENTE' && new Date(lancamento.vencimento) < new Date();
}
