import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Garantia as GarantiaRecord, Prisma } from '@prisma/client';
import { Garantia, RegistrarGarantiaInput } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

function paraGarantia(registro: GarantiaRecord): Garantia {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    contratoDeLocacaoId: registro.contratoDeLocacaoId,
    tipo: registro.tipo,
    estado: registro.estado,
    fiadorPessoaId: registro.fiadorPessoaId,
    substituiGarantiaId: registro.substituiGarantiaId,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-104/US-105 (ART-015-backlog-fase-2.md) / RN-402, RN-403 (ART-010).
// RN-402 em si (bloquear ativação do ContratoDeLocacao sem garantia ATIVA)
// ainda não é verificado em nenhum lugar - fica para US-106 (ativação do
// contrato), quando a máquina de estados de ContratoDeLocacao for
// implementada. Aqui só o ciclo de vida da própria Garantia.
@Injectable()
export class GarantiasService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async registrar(
    tenantId: string,
    atorUsuarioId: string,
    contratoDeLocacaoId: string,
    input: RegistrarGarantiaInput,
  ): Promise<Garantia> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({ where: { id: contratoDeLocacaoId, tenantId } });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado neste tenant.');
      }

      const fiadorPessoaId = await this.validarFiador(tx, tenantId, input);

      const criada = await tx.garantia.create({
        data: { tenantId, contratoDeLocacaoId, tipo: input.tipo, fiadorPessoaId },
      });

      await this.auditoriaService.registrarTx(tx, tenantId, atorUsuarioId, 'GARANTIA_REGISTRADA', 'Garantia', criada.id);

      return paraGarantia(criada);
    });
  }

  // RN-403: a garantia atual (ATIVA) só é encerrada quando a nova estiver
  // validada e ativa (ver ativar()) - aqui ela só entra em EM_SUBSTITUICAO,
  // nunca é encerrada diretamente. CA-402.
  async trocar(
    tenantId: string,
    atorUsuarioId: string,
    contratoDeLocacaoId: string,
    input: RegistrarGarantiaInput,
  ): Promise<Garantia> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({ where: { id: contratoDeLocacaoId, tenantId } });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado neste tenant.');
      }

      const garantiaAtiva = await tx.garantia.findFirst({
        where: { tenantId, contratoDeLocacaoId, estado: 'ATIVA' },
      });
      if (!garantiaAtiva) {
        throw new BadRequestException('Não há garantia ativa para trocar neste contrato.');
      }

      const fiadorPessoaId = await this.validarFiador(tx, tenantId, input);

      const nova = await tx.garantia.create({
        data: { tenantId, contratoDeLocacaoId, tipo: input.tipo, fiadorPessoaId, substituiGarantiaId: garantiaAtiva.id },
      });
      await tx.garantia.update({ where: { id: garantiaAtiva.id }, data: { estado: 'EM_SUBSTITUICAO' } });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        atorUsuarioId,
        'GARANTIA_TROCA_SOLICITADA',
        'Garantia',
        nova.id,
        `substitui=${garantiaAtiva.id}`,
      );

      return paraGarantia(nova);
    });
  }

  // "Validação concluída" (ART-010, seção 8.2) - endpoint não listado
  // literalmente em ART-010 §14 (que só lista registrar/trocar), mas
  // necessário: EM_ANALISE -> ATIVA não acontece sozinho. Quando esta
  // garantia é substituta de outra (substituiGarantiaId preenchido), a
  // antiga é encerrada NA MESMA transação - nunca fica com as duas ativas
  // nem as duas encerradas (RN-403, CA-402: sem janela sem cobertura).
  async ativar(tenantId: string, atorUsuarioId: string, garantiaId: string): Promise<Garantia> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const garantia = await tx.garantia.findFirst({ where: { id: garantiaId, tenantId } });
      if (!garantia) {
        throw new NotFoundException('Garantia não encontrada neste tenant.');
      }
      if (garantia.estado !== 'EM_ANALISE') {
        throw new BadRequestException('Só uma garantia em análise pode ser ativada.');
      }

      const ativada = await tx.garantia.update({ where: { id: garantiaId }, data: { estado: 'ATIVA' } });
      await this.auditoriaService.registrarTx(tx, tenantId, atorUsuarioId, 'GARANTIA_ATIVADA', 'Garantia', garantiaId);

      if (garantia.substituiGarantiaId) {
        await tx.garantia.update({ where: { id: garantia.substituiGarantiaId }, data: { estado: 'ENCERRADA' } });
        await this.auditoriaService.registrarTx(
          tx,
          tenantId,
          atorUsuarioId,
          'GARANTIA_ENCERRADA_POR_SUBSTITUICAO',
          'Garantia',
          garantia.substituiGarantiaId,
          `substituida_por=${garantiaId}`,
        );
      }

      return paraGarantia(ativada);
    });
  }

  async listar(tenantId: string, contratoDeLocacaoId: string): Promise<Garantia[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({ where: { id: contratoDeLocacaoId, tenantId } });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado neste tenant.');
      }
      const registros = await tx.garantia.findMany({
        where: { tenantId, contratoDeLocacaoId },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraGarantia);
    });
  }

  // FIADOR exige fiadorPessoaId (existente no tenant); os demais tipos não
  // aceitam esse campo, para não guardar silenciosamente um dado que o
  // chamador enviou mas que não se aplica ao tipo escolhido.
  private async validarFiador(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: RegistrarGarantiaInput,
  ): Promise<string | null> {
    if (input.tipo === 'FIADOR') {
      if (!input.fiadorPessoaId) {
        throw new BadRequestException('Garantia do tipo FIADOR exige informar o fiador (fiadorPessoaId).');
      }
      const fiador = await tx.pessoa.findFirst({ where: { id: input.fiadorPessoaId, tenantId } });
      if (!fiador) {
        throw new BadRequestException('O fiador informado não existe ou não pertence a este tenant.');
      }
      return input.fiadorPessoaId;
    }

    if (input.fiadorPessoaId) {
      throw new BadRequestException('fiadorPessoaId só se aplica à garantia do tipo FIADOR.');
    }
    return null;
  }
}
