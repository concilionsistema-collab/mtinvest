import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContratoDeLocacao as ContratoDeLocacaoRecord, Prisma } from '@prisma/client';
import { ContratoDeLocacao, ContratoDeLocacaoEstado, CriarContratoDeLocacaoInput } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// ART-010, secao 8.1: mapa de transicoes validas. So o caminho principal ate
// VIGENTE esta implementado nesta fatia (US-106) - encerramento/renovacao
// (US-109 em diante) ainda nao tem nenhuma transicao de saida de VIGENTE.
const TRANSICOES_VALIDAS: Record<ContratoDeLocacaoEstado, ContratoDeLocacaoEstado[]> = {
  RASCUNHO: ['EM_ASSINATURA'],
  EM_ASSINATURA: ['AGUARDANDO_VISTORIA_ENTRADA'],
  AGUARDANDO_VISTORIA_ENTRADA: ['VIGENTE'],
  VIGENTE: [],
  EM_ENCERRAMENTO: [],
  EM_ENCERRAMENTO_ANTECIPADO: [],
  ENCERRADO: [],
};

function paraContratoDeLocacao(registro: ContratoDeLocacaoRecord): ContratoDeLocacao {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    contratoDeAdministracaoId: registro.contratoDeAdministracaoId,
    inquilinoPessoaId: registro.inquilinoPessoaId,
    estado: registro.estado,
    valorAluguel: registro.valorAluguel.toNumber(),
    diaVencimento: registro.diaVencimento,
    indiceReajuste: registro.indiceReajuste,
    aceitaReajusteNegativo: registro.aceitaReajusteNegativo,
    exigeGarantia: registro.exigeGarantia,
    dataInicio: registro.dataInicio.toISOString().slice(0, 10),
    prazoMeses: registro.prazoMeses,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-102/US-106 (ART-015-backlog-fase-2.md) / RN-401, RN-402, RN-404 (ART-010).
// FORA DE ESCOPO (RN-201, ART-008/Fase 3): parametrização financeira
// completa (ordem de cálculo, titularidade de encargos, regras de repasse)
// não é verificada aqui - ART-008 ainda não existe nesta fatia.
@Injectable()
export class ContratosLocacaoService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async criar(
    tenantId: string,
    atorUsuarioId: string,
    input: CriarContratoDeLocacaoInput,
  ): Promise<ContratoDeLocacao> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const administracao = await tx.contratoDeAdministracao.findFirst({
        where: { id: input.contratoDeAdministracaoId, tenantId },
      });
      if (!administracao) {
        throw new BadRequestException('O contrato de administração informado não existe ou não pertence a este tenant.');
      }
      // RN-401 (ART-010): "não existe contrato de locação solto sem administração correspondente".
      if (administracao.status !== 'ATIVO') {
        throw new BadRequestException(
          'O contrato de administração não está ativo - não é possível criar um contrato de locação sobre ele (RN-401).',
        );
      }

      const imovel = await tx.imovel.findFirst({ where: { id: administracao.imovelId, tenantId } });
      if (!imovel || !['LOCACAO', 'AMBOS'].includes(imovel.finalidade)) {
        throw new BadRequestException('O imóvel deste contrato de administração não está disponível para locação.');
      }

      const inquilino = await tx.pessoa.findFirst({ where: { id: input.inquilinoPessoaId, tenantId } });
      if (!inquilino) {
        throw new BadRequestException('O inquilino informado não existe ou não pertence a este tenant.');
      }

      const criado = await tx.contratoDeLocacao.create({
        data: {
          tenantId,
          contratoDeAdministracaoId: input.contratoDeAdministracaoId,
          inquilinoPessoaId: input.inquilinoPessoaId,
          valorAluguel: input.valorAluguel,
          diaVencimento: input.diaVencimento,
          indiceReajuste: input.indiceReajuste,
          aceitaReajusteNegativo: input.aceitaReajusteNegativo,
          exigeGarantia: input.exigeGarantia,
          dataInicio: new Date(input.dataInicio),
          prazoMeses: input.prazoMeses,
        },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        atorUsuarioId,
        'CONTRATO_LOCACAO_CRIADO',
        'ContratoDeLocacao',
        criado.id,
      );

      return paraContratoDeLocacao(criado);
    });
  }

  // Base da tela "Locação" - visão cruzada por unidade, mesmo padrão
  // relacional de PropostasService.listarTodas.
  async listar(tenantId: string, unidadeId: string): Promise<ContratoDeLocacao[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.contratoDeLocacao.findMany({
        where: { tenantId, contratoDeAdministracao: { unidadeId } },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraContratoDeLocacao);
    });
  }

  // RASCUNHO -> EM_ASSINATURA. A tabela de estados de ART-010 §8.1 cita
  // "parametrização financeira e de garantia completa (RN-201, RN-402)"
  // como condição desta transição, mas o CA-401 (o critério de aceite em
  // si) é explícito que o bloqueio de RN-402 é sobre a transição pra
  // VIGENTE, não esta - resolvido aqui a favor do CA-401 (mais preciso que
  // a anotação da tabela de estados). RN-201 (ART-008) fora de escopo, ver
  // comentário no topo do arquivo.
  async avancarParaAssinatura(tenantId: string, atorUsuarioId: string, contratoId: string): Promise<ContratoDeLocacao> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const atualizado = await this.moverEstagioTx(tx, tenantId, contratoId, 'EM_ASSINATURA', atorUsuarioId);
      return paraContratoDeLocacao(atualizado);
    });
  }

  // EM_ASSINATURA -> AGUARDANDO_VISTORIA_ENTRADA. SIMPLIFICACAO REGISTRADA:
  // assinatura eletronica e dependencia externa nao especificada em ART-010
  // (secao 4, escopo excluido) - tratada aqui como confirmacao manual, sem
  // mecanismo de assinatura real.
  async confirmarAssinatura(tenantId: string, atorUsuarioId: string, contratoId: string): Promise<ContratoDeLocacao> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const atualizado = await this.moverEstagioTx(tx, tenantId, contratoId, 'AGUARDANDO_VISTORIA_ENTRADA', atorUsuarioId);
      return paraContratoDeLocacao(atualizado);
    });
  }

  // Chokepoint unico de escrita de ContratoDeLocacao.estado (mesmo padrao de
  // OportunidadesService.moverEstagioTx) - publico e baseado em tx para que
  // VistoriasService.realizarLaudo chame de dentro da propria transacao
  // (RN-404: vistoria de entrada REALIZADA aciona VIGENTE), mantendo os dois
  // estados sincronizados atomicamente.
  async moverEstagioTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    contratoId: string,
    destino: ContratoDeLocacaoEstado,
    atorUsuarioId: string,
  ): Promise<ContratoDeLocacaoRecord> {
    const contrato = await tx.contratoDeLocacao.findFirst({ where: { id: contratoId, tenantId } });
    if (!contrato) {
      throw new NotFoundException('Contrato de locação não encontrado neste tenant.');
    }

    const permitidas = TRANSICOES_VALIDAS[contrato.estado];
    if (!permitidas.includes(destino)) {
      throw new BadRequestException(`Transição de "${contrato.estado}" para "${destino}" não é permitida.`);
    }

    if (destino === 'VIGENTE') {
      // RN-404: vistoria de entrada precisa estar REALIZADA (ou CONFIRMADA,
      // apos eventual contestacao - contestacao e exclusiva de SAIDA nesta
      // fatia, ver Vistoria no schema.prisma).
      const vistoriaDeEntradaConcluida = await tx.vistoria.findFirst({
        where: { tenantId, contratoDeLocacaoId: contratoId, tipo: 'ENTRADA', estado: { in: ['REALIZADA', 'CONFIRMADA'] } },
      });
      if (!vistoriaDeEntradaConcluida) {
        throw new BadRequestException('RN-404: o contrato não pode ficar Vigente sem uma vistoria de entrada realizada.');
      }

      // RN-402/CA-401: so bloqueia quando o proprio contrato exige garantia.
      if (contrato.exigeGarantia) {
        const garantiaAtiva = await tx.garantia.findFirst({
          where: { tenantId, contratoDeLocacaoId: contratoId, estado: 'ATIVA' },
        });
        if (!garantiaAtiva) {
          throw new BadRequestException('RN-402: o contrato exige garantia, mas não há garantia ATIVA vinculada.');
        }
      }
    }

    const atualizado = await tx.contratoDeLocacao.update({ where: { id: contratoId }, data: { estado: destino } });

    await this.auditoriaService.registrarTx(
      tx,
      tenantId,
      atorUsuarioId,
      'CONTRATO_LOCACAO_ESTADO_ALTERADO',
      'ContratoDeLocacao',
      contratoId,
      `${contrato.estado}->${destino}`,
    );

    return atualizado;
  }
}
