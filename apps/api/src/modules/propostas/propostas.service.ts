import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Proposta as PropostaRecord, Prisma } from '@prisma/client';
import { Proposta, RegistrarContrapropostaInput, RegistrarPropostaInput } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';

function paraProposta(registro: PropostaRecord): Proposta {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    oportunidadeId: registro.oportunidadeId,
    tipo: registro.tipo,
    valor: registro.valor.toNumber(),
    condicoes: registro.condicoes,
    status: registro.status,
    aprovadorUsuarioId: registro.aprovadorUsuarioId,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

@Injectable()
export class PropostasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly oportunidadesService: OportunidadesService,
  ) {}

  // US-016 (ART-014) / RN-305 (ART-009): valor e condicoes explicitos (a
  // ausencia de valor numerico ja e rejeitada pelo DTO, CA-001). So o
  // responsavel pelo lead da oportunidade pode registrar.
  async registrar(
    tenantId: string,
    oportunidadeId: string,
    input: RegistrarPropostaInput,
    usuarioId: string,
  ): Promise<Proposta> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await tx.oportunidade.findFirst({ where: { id: oportunidadeId, tenantId } });
      if (!oportunidade) {
        throw new NotFoundException('Oportunidade não encontrada neste tenant.');
      }
      await this.validarResponsavel(tx, tenantId, oportunidade.leadId, usuarioId);

      const criada = await tx.proposta.create({
        data: { tenantId, oportunidadeId, tipo: 'INICIAL', valor: input.valor, condicoes: input.condicoes },
      });

      await this.oportunidadesService.moverEstagioTx(tx, tenantId, oportunidadeId, 'PROPOSTA_ENVIADA', usuarioId);

      return paraProposta(criada);
    });
  }

  // US-017 (ART-014) / RN-306 (ART-009): desconto dentro da faixa
  // pre-autorizada do imovel segue direto; fora da faixa (ou sem faixa
  // cadastrada, DEC-NEG-013) exige aprovadorUsuarioId registrado.
  async contrapropor(
    tenantId: string,
    oportunidadeId: string,
    input: RegistrarContrapropostaInput,
    usuarioId: string,
  ): Promise<Proposta> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await tx.oportunidade.findFirst({ where: { id: oportunidadeId, tenantId } });
      if (!oportunidade) {
        throw new NotFoundException('Oportunidade não encontrada neste tenant.');
      }
      await this.validarResponsavel(tx, tenantId, oportunidade.leadId, usuarioId);

      const imovel = await tx.imovel.findFirst({ where: { id: oportunidade.imovelId, tenantId } });
      const valorAnunciado = imovel?.valorAnunciado?.toNumber() ?? null;
      const faixaPreAutorizada = imovel?.percentualDescontoPreAutorizado?.toNumber() ?? null;

      const descontoPercentual =
        valorAnunciado && valorAnunciado > 0 ? ((valorAnunciado - input.valor) / valorAnunciado) * 100 : null;

      const dentroDaFaixa =
        descontoPercentual !== null &&
        faixaPreAutorizada !== null &&
        descontoPercentual <= faixaPreAutorizada;

      if (!dentroDaFaixa) {
        if (!input.aprovadorUsuarioId) {
          throw new BadRequestException(
            valorAnunciado === null
              ? 'Imóvel sem valor anunciado cadastrado — toda contraproposta exige aprovador registrado (DEC-NEG-013).'
              : faixaPreAutorizada === null
                ? 'Imóvel sem faixa de desconto pré-autorizada cadastrada — toda contraproposta exige aprovador registrado (DEC-NEG-013).'
                : `Desconto de ${descontoPercentual!.toFixed(2)}% excede a faixa pré-autorizada de ${faixaPreAutorizada}% — exige aprovador registrado (CA-002, US-017).`,
          );
        }
        const aprovador = await tx.usuario.findFirst({ where: { id: input.aprovadorUsuarioId, tenantId } });
        if (!aprovador) {
          throw new BadRequestException('O aprovador informado não existe ou não pertence a este tenant.');
        }
      }

      const criada = await tx.proposta.create({
        data: {
          tenantId,
          oportunidadeId,
          tipo: 'CONTRAPROPOSTA',
          valor: input.valor,
          condicoes: input.condicoes,
          aprovadorUsuarioId: dentroDaFaixa ? null : input.aprovadorUsuarioId,
        },
      });

      await this.oportunidadesService.moverEstagioTx(tx, tenantId, oportunidadeId, 'EM_CONTRAPROPOSTA', usuarioId);

      return paraProposta(criada);
    });
  }

  // PENDENCIA DE README FECHADA: "Permissões" de US-017 ("responsável pela
  // oportunidade") nao era verificada - qualquer usuario do tenant podia
  // aceitar a proposta de qualquer oportunidade.
  async aceitar(tenantId: string, propostaId: string, usuarioId: string): Promise<Proposta> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const proposta = await tx.proposta.findFirst({ where: { id: propostaId, tenantId } });
      if (!proposta) {
        throw new NotFoundException('Proposta não encontrada neste tenant.');
      }
      await this.oportunidadesService.validarResponsavelDaOportunidade(tx, tenantId, proposta.oportunidadeId, usuarioId);

      const atualizada = await tx.proposta.update({ where: { id: propostaId }, data: { status: 'ACEITA' } });
      return paraProposta(atualizada);
    });
  }

  // PENDENCIA DE README FECHADA: leitura nao verificava unidade - qualquer
  // usuario do tenant listava propostas de qualquer oportunidade. Escopo de
  // leitura e por unidade (nao so o responsavel individual), para o Gestor
  // de unidade conseguir acompanhar o funil inteiro (US-011, "Gestor de
  // unidade ve todas as da unidade").
  async listarPorOportunidade(tenantId: string, oportunidadeId: string, unidadeId: string): Promise<Proposta[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const oportunidade = await tx.oportunidade.findFirst({
        where: { id: oportunidadeId, tenantId, lead: { unidadeId } },
      });
      if (!oportunidade) {
        throw new NotFoundException('Oportunidade não encontrada nesta unidade.');
      }
      const registros = await tx.proposta.findMany({
        where: { tenantId, oportunidadeId },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraProposta);
    });
  }

  // Base da tela "Propostas" (visao cruzada, fora de uma oportunidade
  // especifica). Mesmo escopo por unidade de listarPorOportunidade.
  async listarTodas(tenantId: string, unidadeId: string): Promise<Proposta[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.proposta.findMany({
        where: { tenantId, oportunidade: { lead: { unidadeId } } },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraProposta);
    });
  }

  private async validarResponsavel(
    tx: Prisma.TransactionClient,
    tenantId: string,
    leadId: string,
    usuarioId: string,
  ): Promise<void> {
    const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead || lead.responsavelUsuarioId !== usuarioId) {
      throw new BadRequestException('Apenas o responsável pelo lead desta oportunidade pode realizar esta ação.');
    }
  }
}
