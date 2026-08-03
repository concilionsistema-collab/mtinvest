import { BadRequestException, Injectable } from '@nestjs/common';
import { ContratoDeAdministracao as ContratoDeAdministracaoRecord } from '@prisma/client';
import { ContratoDeAdministracao, CriarContratoDeAdministracaoInput } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

function paraContratoDeAdministracao(registro: ContratoDeAdministracaoRecord): ContratoDeAdministracao {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    unidadeId: registro.unidadeId,
    imovelId: registro.imovelId,
    proprietarioPessoaId: registro.proprietarioPessoaId,
    status: registro.status,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-101 (ART-015-backlog-fase-2.md) / pré-condição de RN-401 (ART-010).
@Injectable()
export class ContratosAdministracaoService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // EXTENSAO REGISTRADA: ART-010 nao especifica se o contrato de
  // administracao e por imovel ou por portfolio do proprietario (so diz
  // "vincula Unidade e Pessoa") - implementado 1:1 por imovel, ver
  // comentario em schema.prisma, model ContratoDeAdministracao.
  async criar(
    tenantId: string,
    atorUsuarioId: string,
    input: CriarContratoDeAdministracaoInput,
  ): Promise<ContratoDeAdministracao> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const unidade = await tx.unidade.findFirst({ where: { id: input.unidadeId, tenantId } });
      if (!unidade) {
        throw new BadRequestException('A unidade informada não existe ou não pertence a este tenant.');
      }

      const imovel = await tx.imovel.findFirst({ where: { id: input.imovelId, tenantId } });
      if (!imovel) {
        throw new BadRequestException('O imóvel informado não existe ou não pertence a este tenant.');
      }

      const proprietario = await tx.pessoa.findFirst({ where: { id: input.proprietarioPessoaId, tenantId } });
      if (!proprietario) {
        throw new BadRequestException('O proprietário informado não existe ou não pertence a este tenant.');
      }

      const administracaoAtivaExistente = await tx.contratoDeAdministracao.findFirst({
        where: { tenantId, imovelId: input.imovelId, status: 'ATIVO' },
      });
      if (administracaoAtivaExistente) {
        throw new BadRequestException('Já existe um contrato de administração ativo para este imóvel.');
      }

      const criado = await tx.contratoDeAdministracao.create({
        data: {
          tenantId,
          unidadeId: input.unidadeId,
          imovelId: input.imovelId,
          proprietarioPessoaId: input.proprietarioPessoaId,
        },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        atorUsuarioId,
        'CONTRATO_ADMINISTRACAO_CRIADO',
        'ContratoDeAdministracao',
        criado.id,
      );

      return paraContratoDeAdministracao(criado);
    });
  }

  async listar(tenantId: string, unidadeId: string): Promise<ContratoDeAdministracao[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.contratoDeAdministracao.findMany({
        where: { tenantId, unidadeId },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraContratoDeAdministracao);
    });
  }
}
