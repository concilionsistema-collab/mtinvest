import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Imovel as ImovelRecord, ImovelCoproprietario as CoproprietarioRecord } from '@prisma/client';
import {
  CompartilharImovelInput,
  CriarImovelInput,
  DefinirCoproprietariosInput,
  Imovel,
  ImovelCoproprietario,
} from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

function paraImovel(registro: ImovelRecord): Imovel {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    unidadeProprietariaId: registro.unidadeProprietariaId,
    finalidade: registro.finalidade,
    enderecoResumo: registro.enderecoResumo,
    valorAnunciado: registro.valorAnunciado ? registro.valorAnunciado.toNumber() : null,
    percentualDescontoPreAutorizado: registro.percentualDescontoPreAutorizado
      ? registro.percentualDescontoPreAutorizado.toNumber()
      : null,
    estadoCompartilhamento: registro.estadoCompartilhamento,
    escopoCompartilhamento: registro.escopoCompartilhamento,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

function paraCoproprietario(registro: CoproprietarioRecord): ImovelCoproprietario {
  return {
    id: registro.id,
    imovelId: registro.imovelId,
    pessoaId: registro.pessoaId,
    percentual: registro.percentual.toNumber(),
    vigenteDe: registro.vigenteDe.toISOString().slice(0, 10),
    vigenteAte: registro.vigenteAte ? registro.vigenteAte.toISOString().slice(0, 10) : null,
  };
}

const TOLERANCIA_SOMA_PERCENTUAL = 0.01;

@Injectable()
export class ImoveisService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // US-004 (ART-014) / RN-005 (ART-004): a unidade proprietaria e sempre a
  // unidade informada, e precisa pertencer ao mesmo tenant do requisitante -
  // validado aqui na aplicacao, alem da segregacao por RLS no banco.
  async criar(tenantId: string, input: CriarImovelInput): Promise<Imovel> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const unidade = await tx.unidade.findFirst({
        where: { id: input.unidadeProprietariaId, tenantId },
      });
      if (!unidade) {
        throw new BadRequestException(
          'A unidade proprietária informada não existe ou não pertence a este tenant.',
        );
      }

      const criado = await tx.imovel.create({
        data: {
          tenantId,
          unidadeProprietariaId: input.unidadeProprietariaId,
          finalidade: input.finalidade,
          enderecoResumo: input.enderecoResumo,
          valorAnunciado: input.valorAnunciado,
          percentualDescontoPreAutorizado: input.percentualDescontoPreAutorizado,
        },
      });

      return paraImovel(criado);
    });
  }

  // PENDENCIA DE README FECHADA ("Próximos passos sugeridos", item 1): antes,
  // qualquer usuário do tenant listava imóveis de qualquer unidade, mesmo
  // EXCLUSIVO_DA_UNIDADE de outra. Visibilidade: a unidade proprietária
  // sempre ve os proprios imoveis (inclusive ENCERRADO, para historico de
  // carteira); outra unidade so ve se COMPARTILHADO (mesmo criterio do
  // RadarService.sugerir, RN-006 - REGIAO/LISTA nao tem dado estruturado
  // para filtrar de verdade neste MVP, qualquer COMPARTILHADO conta).
  async listar(tenantId: string, unidadeId: string): Promise<Imovel[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.imovel.findMany({
        where: {
          tenantId,
          OR: [{ unidadeProprietariaId: unidadeId }, { estadoCompartilhamento: 'COMPARTILHADO' }],
        },
        orderBy: { criadoEm: 'asc' },
      });
      return registros.map(paraImovel);
    });
  }

  // US-005 (ART-014) / RN-005 (ART-004): a unidade proprietaria nunca muda
  // por compartilhamento - so o estado e o escopo de visibilidade mudam.
  // ART-005, secao 9: toda escrita em Imovel.estadoCompartilhamento gera
  // RegistroDeAuditoria (item obrigatorio, nao so "US-005 registrada").
  async compartilhar(
    tenantId: string,
    imovelId: string,
    input: CompartilharImovelInput,
    atorUsuarioId: string,
  ): Promise<Imovel> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const imovel = await tx.imovel.findFirst({ where: { id: imovelId, tenantId } });
      if (!imovel) {
        throw new NotFoundException('Imóvel não encontrado neste tenant.');
      }
      if (imovel.estadoCompartilhamento !== 'EXCLUSIVO_DA_UNIDADE') {
        throw new BadRequestException(
          `Imóvel já está em estado "${imovel.estadoCompartilhamento}"; só é possível compartilhar um imóvel exclusivo da unidade.`,
        );
      }

      const atualizado = await tx.imovel.update({
        where: { id: imovelId },
        data: {
          estadoCompartilhamento: 'COMPARTILHADO',
          escopoCompartilhamento: input.escopoCompartilhamento,
        },
      });

      await tx.compartilhamentoDeImovel.create({
        data: { tenantId, imovelId, evento: 'COMPARTILHADO' },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        atorUsuarioId,
        'IMOVEL_COMPARTILHADO',
        'Imovel',
        imovelId,
        `escopo=${input.escopoCompartilhamento}`,
      );

      return paraImovel(atualizado);
    });
  }

  // RN-006 (ART-004): revogação é bloqueada durante negociação ativa de
  // outra unidade. O estado "COMPARTILHADO_EM_NEGOCIACAO" que representaria
  // isso ainda não é alcançável nesta fatia do sistema - depende de
  // Oportunidade (EPIC-04, ainda não implementado) marcar o imóvel como tal.
  // Por ora, a validação abaixo cobre apenas a transição de estado válida;
  // o bloqueio por negociação ativa precisa ser revisado quando EPIC-04
  // existir, para não regredir essa regra silenciosamente.
  async revogarCompartilhamento(tenantId: string, imovelId: string, atorUsuarioId: string): Promise<Imovel> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const imovel = await tx.imovel.findFirst({ where: { id: imovelId, tenantId } });
      if (!imovel) {
        throw new NotFoundException('Imóvel não encontrado neste tenant.');
      }
      if (imovel.estadoCompartilhamento !== 'COMPARTILHADO') {
        throw new BadRequestException(
          `Imóvel está em estado "${imovel.estadoCompartilhamento}"; só é possível revogar um compartilhamento ativo (RN-006, ART-004).`,
        );
      }

      const atualizado = await tx.imovel.update({
        where: { id: imovelId },
        data: { estadoCompartilhamento: 'EXCLUSIVO_DA_UNIDADE', escopoCompartilhamento: null },
      });

      await tx.compartilhamentoDeImovel.create({
        data: { tenantId, imovelId, evento: 'REVOGADO' },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        atorUsuarioId,
        'IMOVEL_COMPARTILHAMENTO_REVOGADO',
        'Imovel',
        imovelId,
      );

      return paraImovel(atualizado);
    });
  }

  // US-006 (ART-014) / ART-005 secao 5 (vigencia temporal): a composicao
  // inteira e definida em uma unica chamada, validada atomicamente (CA-001/
  // CA-002 de ART-014, RN-208 de ART-008 aplicado preventivamente aqui). A
  // composicao anterior e fechada (vigenteAte), nunca apagada.
  async definirCoproprietarios(
    tenantId: string,
    imovelId: string,
    input: DefinirCoproprietariosInput,
  ): Promise<ImovelCoproprietario[]> {
    const soma = input.coproprietarios.reduce((total, item) => total + item.percentual, 0);
    if (Math.abs(soma - 100) > TOLERANCIA_SOMA_PERCENTUAL) {
      throw new BadRequestException(
        `A soma dos percentuais deve ser exatamente 100% (recebido: ${soma.toFixed(2)}%).`,
      );
    }
    if (input.coproprietarios.length === 0) {
      throw new BadRequestException('Informe ao menos um coproprietário.');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const imovel = await tx.imovel.findFirst({ where: { id: imovelId, tenantId } });
      if (!imovel) {
        throw new NotFoundException('Imóvel não encontrado neste tenant.');
      }

      const pessoaIds = input.coproprietarios.map((item) => item.pessoaId);
      const pessoasEncontradas = await tx.pessoa.findMany({
        where: { id: { in: pessoaIds }, tenantId },
        select: { id: true },
      });
      if (pessoasEncontradas.length !== new Set(pessoaIds).size) {
        throw new BadRequestException(
          'Uma ou mais pessoas informadas não existem ou não pertencem a este tenant.',
        );
      }

      const hoje = new Date();

      await tx.imovelCoproprietario.updateMany({
        where: { imovelId, tenantId, vigenteAte: null },
        data: { vigenteAte: hoje },
      });

      await tx.imovelCoproprietario.createMany({
        data: input.coproprietarios.map((item) => ({
          tenantId,
          imovelId,
          pessoaId: item.pessoaId,
          percentual: item.percentual,
          vigenteDe: hoje,
        })),
      });

      const vigentes = await tx.imovelCoproprietario.findMany({
        where: { imovelId, tenantId, vigenteAte: null },
      });
      return vigentes.map(paraCoproprietario);
    });
  }

  async listarCoproprietariosVigentes(
    tenantId: string,
    imovelId: string,
  ): Promise<ImovelCoproprietario[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.imovelCoproprietario.findMany({
        where: { imovelId, tenantId, vigenteAte: null },
      });
      return registros.map(paraCoproprietario);
    });
  }
}
