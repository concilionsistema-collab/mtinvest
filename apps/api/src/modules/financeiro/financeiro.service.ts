import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LancamentoFinanceiro as LancamentoRecord, Prisma } from '@prisma/client';
import {
  AtualizarLancamentoFinanceiroInput,
  CriarLancamentoFinanceiroInput,
  LancamentoFinanceiro,
  ResumoLancamentosFinanceiros,
} from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';

function paraLancamento(registro: LancamentoRecord): LancamentoFinanceiro {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    unidadeId: registro.unidadeId,
    tipo: registro.tipo,
    categoria: registro.categoria,
    descricao: registro.descricao,
    valor: registro.valor.toNumber(),
    vencimento: registro.vencimento.toISOString(),
    status: registro.status,
    dataLiquidacao: registro.dataLiquidacao ? registro.dataLiquidacao.toISOString() : null,
    liquidadoPorUsuarioId: registro.liquidadoPorUsuarioId,
    canceladoEm: registro.canceladoEm ? registro.canceladoEm.toISOString() : null,
    canceladoPorUsuarioId: registro.canceladoPorUsuarioId,
    motivoCancelamento: registro.motivoCancelamento,
    contraparte: registro.contraparte,
    pessoaId: registro.pessoaId,
    oportunidadeId: registro.oportunidadeId,
    contratoDeLocacaoId: registro.contratoDeLocacaoId,
    observacoes: registro.observacoes,
    criadoPorUsuarioId: registro.criadoPorUsuarioId,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// EXTENSAO REGISTRADA (livro-razao manual, DEC-ARQ-006): ver comentario
// completo em prisma/schema.prisma, model LancamentoFinanceiro. Restrito a
// GESTOR_UNIDADE (dado financeiro sensivel, mesmo criterio de
// IndicadoresService) e sempre escopado a unidadeId do ator - nao existe
// perfil de rede/matriz nesta fatia.
@Injectable()
export class FinanceiroService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  private assertGestor(ator: UsuarioAutenticado): void {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException(
        'Apenas Gestor de unidade pode acessar Contas a Pagar/Receber (dado financeiro sensível).',
      );
    }
  }

  async criar(
    tenantId: string,
    ator: UsuarioAutenticado,
    input: CriarLancamentoFinanceiroInput,
  ): Promise<LancamentoFinanceiro> {
    this.assertGestor(ator);
    return this.tenantPrisma.run(tenantId, async (tx) => {
      if (input.pessoaId) {
        const pessoa = await tx.pessoa.findFirst({ where: { id: input.pessoaId, tenantId } });
        if (!pessoa) throw new BadRequestException('Pessoa informada não encontrada neste tenant.');
      }
      if (input.oportunidadeId) {
        const oportunidade = await tx.oportunidade.findFirst({ where: { id: input.oportunidadeId, tenantId } });
        if (!oportunidade) throw new BadRequestException('Negociação informada não encontrada neste tenant.');
      }
      if (input.contratoDeLocacaoId) {
        const contrato = await tx.contratoDeLocacao.findFirst({ where: { id: input.contratoDeLocacaoId, tenantId } });
        if (!contrato) throw new BadRequestException('Contrato de locação informado não encontrado neste tenant.');
      }

      const criado = await tx.lancamentoFinanceiro.create({
        data: {
          tenantId,
          unidadeId: ator.unidadeId,
          tipo: input.tipo,
          categoria: input.categoria,
          descricao: input.descricao,
          valor: input.valor,
          vencimento: new Date(input.vencimento),
          contraparte: input.contraparte,
          pessoaId: input.pessoaId,
          oportunidadeId: input.oportunidadeId,
          contratoDeLocacaoId: input.contratoDeLocacaoId,
          observacoes: input.observacoes,
          criadoPorUsuarioId: ator.id,
        },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'LANCAMENTO_FINANCEIRO_CRIADO',
        'LancamentoFinanceiro',
        criado.id,
      );

      return paraLancamento(criado);
    });
  }

  async listar(tenantId: string, ator: UsuarioAutenticado): Promise<LancamentoFinanceiro[]> {
    this.assertGestor(ator);
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.lancamentoFinanceiro.findMany({
        where: { tenantId, unidadeId: ator.unidadeId },
        orderBy: { vencimento: 'asc' },
      });
      return registros.map(paraLancamento);
    });
  }

  async resumo(tenantId: string, ator: UsuarioAutenticado): Promise<ResumoLancamentosFinanceiros> {
    this.assertGestor(ator);
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.lancamentoFinanceiro.findMany({
        where: { tenantId, unidadeId: ator.unidadeId },
        select: { tipo: true, status: true, valor: true, vencimento: true, dataLiquidacao: true },
      });

      const agora = new Date();
      const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

      const somar = (lista: typeof registros) => lista.reduce((soma, r) => soma + r.valor.toNumber(), 0);

      const pendentes = registros.filter((r) => r.status === 'PENDENTE');
      const atrasados = pendentes.filter((r) => r.vencimento < agora);
      const liquidadosNoMes = registros.filter(
        (r) => r.status === 'LIQUIDADO' && r.dataLiquidacao && r.dataLiquidacao >= inicioDoMes,
      );

      return {
        unidadeId: ator.unidadeId,
        totalPendenteAReceber: somar(pendentes.filter((r) => r.tipo === 'A_RECEBER')),
        totalPendenteAPagar: somar(pendentes.filter((r) => r.tipo === 'A_PAGAR')),
        totalAtrasadoAReceber: somar(atrasados.filter((r) => r.tipo === 'A_RECEBER')),
        totalAtrasadoAPagar: somar(atrasados.filter((r) => r.tipo === 'A_PAGAR')),
        totalLiquidadoNoMesAReceber: somar(liquidadosNoMes.filter((r) => r.tipo === 'A_RECEBER')),
        totalLiquidadoNoMesAPagar: somar(liquidadosNoMes.filter((r) => r.tipo === 'A_PAGAR')),
      };
    });
  }

  async atualizar(
    tenantId: string,
    ator: UsuarioAutenticado,
    id: string,
    input: AtualizarLancamentoFinanceiroInput,
  ): Promise<LancamentoFinanceiro> {
    this.assertGestor(ator);
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const lancamento = await this.buscarDaUnidade(tx, tenantId, ator, id);
      if (lancamento.status !== 'PENDENTE') {
        throw new BadRequestException('Não é possível editar um lançamento já liquidado ou cancelado.');
      }

      const atualizado = await tx.lancamentoFinanceiro.update({
        where: { id },
        data: {
          categoria: input.categoria,
          descricao: input.descricao,
          valor: input.valor,
          vencimento: input.vencimento ? new Date(input.vencimento) : undefined,
          contraparte: input.contraparte,
          observacoes: input.observacoes,
        },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'LANCAMENTO_FINANCEIRO_ATUALIZADO',
        'LancamentoFinanceiro',
        id,
      );

      return paraLancamento(atualizado);
    });
  }

  async liquidar(tenantId: string, ator: UsuarioAutenticado, id: string): Promise<LancamentoFinanceiro> {
    this.assertGestor(ator);
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const lancamento = await this.buscarDaUnidade(tx, tenantId, ator, id);
      if (lancamento.status !== 'PENDENTE') {
        throw new BadRequestException('Este lançamento não está pendente.');
      }

      const atualizado = await tx.lancamentoFinanceiro.update({
        where: { id },
        data: { status: 'LIQUIDADO', dataLiquidacao: new Date(), liquidadoPorUsuarioId: ator.id },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'LANCAMENTO_FINANCEIRO_LIQUIDADO',
        'LancamentoFinanceiro',
        id,
      );

      return paraLancamento(atualizado);
    });
  }

  async cancelar(tenantId: string, ator: UsuarioAutenticado, id: string, motivo: string): Promise<LancamentoFinanceiro> {
    this.assertGestor(ator);
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const lancamento = await this.buscarDaUnidade(tx, tenantId, ator, id);
      if (lancamento.status !== 'PENDENTE') {
        throw new BadRequestException('Este lançamento não está pendente.');
      }

      const atualizado = await tx.lancamentoFinanceiro.update({
        where: { id },
        data: {
          status: 'CANCELADO',
          canceladoEm: new Date(),
          canceladoPorUsuarioId: ator.id,
          motivoCancelamento: motivo,
        },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'LANCAMENTO_FINANCEIRO_CANCELADO',
        'LancamentoFinanceiro',
        id,
        motivo,
      );

      return paraLancamento(atualizado);
    });
  }

  private async buscarDaUnidade(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ator: UsuarioAutenticado,
    id: string,
  ): Promise<LancamentoRecord> {
    const lancamento = await tx.lancamentoFinanceiro.findFirst({
      where: { id, tenantId, unidadeId: ator.unidadeId },
    });
    if (!lancamento) {
      throw new NotFoundException('Lançamento financeiro não encontrado nesta unidade.');
    }
    return lancamento;
  }
}
