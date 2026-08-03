import { BadRequestException, Injectable } from '@nestjs/common';
import { ContratoDeLocacao as ContratoDeLocacaoRecord } from '@prisma/client';
import { ContratoDeLocacao, CriarContratoDeLocacaoInput } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

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
    dataInicio: registro.dataInicio.toISOString().slice(0, 10),
    prazoMeses: registro.prazoMeses,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-102 (ART-015-backlog-fase-2.md) / RN-401 (ART-010).
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
}
