import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContratoDeLocacao as ContratoDeLocacaoRecord, Prisma } from '@prisma/client';
import { ContratoDeLocacao, ContratoDeLocacaoEstado, CriarContratoDeLocacaoInput } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// ART-010, secao 8.1: mapa de transicoes validas. VIGENTE -> EM_ENCERRAMENTO
// (US-109/US-110, RN-409/CA-404) acontece automaticamente quando
// vencimentoAtual e alcancado sem renovacao confirmada
// (executarVarreduraAutomaticaTx). VIGENTE -> EM_ENCERRAMENTO_ANTECIPADO
// (US-111, RN-410) e solicitada por um GESTOR_UNIDADE via
// EncerramentoAntecipadoService - BLOQUEADA para uso em producao real ate
// validacao juridica formal (ART-010 secao 21), ver comentario no schema.
// EM_ENCERRAMENTO/EM_ENCERRAMENTO_ANTECIPADO -> ENCERRADO (fecho do ciclo,
// depende de vistoria de saida + liquidacao de garantia, ainda nao
// implementado) continua fora desta fatia.
const TRANSICOES_VALIDAS: Record<ContratoDeLocacaoEstado, ContratoDeLocacaoEstado[]> = {
  RASCUNHO: ['EM_ASSINATURA'],
  EM_ASSINATURA: ['AGUARDANDO_VISTORIA_ENTRADA'],
  AGUARDANDO_VISTORIA_ENTRADA: ['VIGENTE'],
  VIGENTE: ['EM_ENCERRAMENTO', 'EM_ENCERRAMENTO_ANTECIPADO'],
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
    vencimentoAtual: registro.vencimentoAtual.toISOString().slice(0, 10),
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// RN-408: hipotese de trabalho (DEC-NEG-015) - somar meses em UTC pra nao
// sofrer deslocamento de fuso (os campos sao @db.Date, meia-noite UTC).
// SIMPLIFICACAO REGISTRADA: usa Date.setUTCMonth puro, sem tratamento
// especial de "dia inexistente no mes destino" (ex.: 31/01 + 1 mes vira
// 03/03 se fevereiro tiver 28 dias) - aceitavel para prazos em meses
// cheios, que e o caso de uso real de locacao.
// Exportada porque RenovacoesService precisa da MESMA lógica pra estender
// vencimentoAtual (evita duas implementações de soma de meses divergirem).
export function somarMeses(data: Date, meses: number): Date {
  const resultado = new Date(data);
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  return resultado;
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

      const dataInicio = new Date(input.dataInicio);
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
          dataInicio,
          prazoMeses: input.prazoMeses,
          vencimentoAtual: somarMeses(dataInicio, input.prazoMeses),
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
    atorUsuarioId: string | null,
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

  // RN-409/CA-404: "ausencia de decisao de renovacao ate o vencimento aciona
  // fluxo de encerramento, nao renovacao tacita silenciosa". Mesmo padrao de
  // SchedulerService (ver ReservasService.executarVarreduraAutomaticaTx) -
  // varre contratos VIGENTE cujo vencimentoAtual ja passou (nao houve
  // RenovacoesService.confirmar a tempo, senao vencimentoAtual teria sido
  // empurrado pra frente) e move para EM_ENCERRAMENTO, ator sistema (null).
  // "Inicia vistoria de saida" (ART-010 §8.1): nao agenda nada sozinho - so
  // libera o estado em que VistoriasService.agendar(SAIDA) ja aceita
  // (EM_ENCERRAMENTO, ver US-107), quem agenda de fato e um humano.
  async executarVarreduraAutomaticaTx(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const vencidos = await tx.contratoDeLocacao.findMany({
      where: { tenantId, estado: 'VIGENTE', vencimentoAtual: { lt: new Date() } },
    });
    for (const contrato of vencidos) {
      await this.moverEstagioTx(tx, tenantId, contrato.id, 'EM_ENCERRAMENTO', null);
    }
  }
}
