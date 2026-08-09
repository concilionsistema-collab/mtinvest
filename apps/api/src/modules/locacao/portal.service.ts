import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { AcessoPortalContrato as AcessoRecord } from '@prisma/client';
import { AcessoPortalContrato, GerarAcessoPortalInput, GerarAcessoPortalResultado, PortalContratoResumo } from '@crm/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { paraDocumento } from './documentos.service';
import { paraVistoria } from './vistorias.service';
import { paraReajuste } from './reajustes.service';
import { paraRenovacao } from './renovacoes.service';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function paraAcesso(registro: AcessoRecord): AcessoPortalContrato {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    contratoDeLocacaoId: registro.contratoDeLocacaoId,
    pessoaId: registro.pessoaId,
    criadoPorUsuarioId: registro.criadoPorUsuarioId,
    revogadoEm: registro.revogadoEm ? registro.revogadoEm.toISOString() : null,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// Implementa US-113 (ART-015-backlog-fase-2.md) / RN-413 (ART-010).
// DECISAO TECNICA REGISTRADA: ver comentario em schema.prisma, model
// AcessoPortalContrato - token opaco de alta entropia, so o hash SHA-256 e
// persistido (mesmo padrao de RefreshToken em AuthService), entregue fora da
// banda (sem e-mail/SMS real nesta fatia).
// CORREÇÃO DE SEGURANÇA REGISTRADA (revisão de 2026-08-08): gerarAcesso/
// revogarAcesso/listarAcessos agora escopam por unidade (mesmo padrão de
// GarantiasService/VistoriasService) - antes, qualquer usuário do tenant
// podia gerenciar acesso de portal de um contrato de outra unidade.
// consultar() continua sem conceito de unidade (é resolvida pelo token, sem
// ator autenticado nenhum).
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // Permissão: gerar acesso concede leitura externa a um terceiro - decisão
  // sensível, reaproveita GESTOR_UNIDADE (mesmo padrão das demais ações
  // sensíveis desta fase).
  async gerarAcesso(
    tenantId: string,
    ator: UsuarioAutenticado,
    contratoDeLocacaoId: string,
    input: GerarAcessoPortalInput,
  ): Promise<GerarAcessoPortalResultado> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode gerar acesso ao portal do proprietário/inquilino.');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId: ator.unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      const administracao = await tx.contratoDeAdministracao.findFirst({
        where: { id: contrato.contratoDeAdministracaoId, tenantId },
      });
      if (!administracao) {
        throw new NotFoundException('Contrato de administração deste contrato não encontrado.');
      }

      // RN-413/§13: só o proprietário ou o inquilino DESTE contrato podem
      // ganhar acesso - nunca um terceiro qualquer, mesmo que exista no tenant.
      const pessoaEhProprietarioOuInquilino =
        input.pessoaId === administracao.proprietarioPessoaId || input.pessoaId === contrato.inquilinoPessoaId;
      if (!pessoaEhProprietarioOuInquilino) {
        throw new BadRequestException('A pessoa informada não é o proprietário nem o inquilino deste contrato (RN-413).');
      }

      const token = randomBytes(32).toString('hex');
      const criado = await tx.acessoPortalContrato.create({
        data: {
          tenantId,
          contratoDeLocacaoId,
          pessoaId: input.pessoaId,
          tokenHash: hashToken(token),
          criadoPorUsuarioId: ator.id,
        },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        ator.id,
        'ACESSO_PORTAL_GERADO',
        'ContratoDeLocacao',
        contratoDeLocacaoId,
        `pessoaId=${input.pessoaId}`,
      );

      return { ...paraAcesso(criado), token };
    });
  }

  async revogarAcesso(tenantId: string, ator: UsuarioAutenticado, acessoId: string): Promise<AcessoPortalContrato> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode revogar acesso ao portal.');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const acesso = await tx.acessoPortalContrato.findFirst({
        where: { id: acessoId, tenantId, contratoDeLocacao: { contratoDeAdministracao: { unidadeId: ator.unidadeId } } },
      });
      if (!acesso) {
        throw new NotFoundException('Acesso de portal não encontrado nesta unidade.');
      }
      // Idempotente - revogar de novo um acesso já revogado não é erro (mesmo
      // espírito de PessoasService.solicitarEliminacao para titular já anonimizado).
      if (acesso.revogadoEm) {
        return paraAcesso(acesso);
      }

      const atualizado = await tx.acessoPortalContrato.update({ where: { id: acessoId }, data: { revogadoEm: new Date() } });
      await this.auditoriaService.registrarTx(tx, tenantId, ator.id, 'ACESSO_PORTAL_REVOGADO', 'ContratoDeLocacao', acesso.contratoDeLocacaoId);

      return paraAcesso(atualizado);
    });
  }

  async listarAcessos(tenantId: string, ator: UsuarioAutenticado, contratoDeLocacaoId: string): Promise<AcessoPortalContrato[]> {
    if (ator.perfil !== 'GESTOR_UNIDADE') {
      throw new ForbiddenException('Só o Gestor de unidade pode ver os acessos de portal deste contrato.');
    }

    return this.tenantPrisma.run(tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: contratoDeLocacaoId, tenantId, contratoDeAdministracao: { unidadeId: ator.unidadeId } },
      });
      if (!contrato) {
        throw new NotFoundException('Contrato de locação não encontrado nesta unidade.');
      }
      const registros = await tx.acessoPortalContrato.findMany({
        where: { tenantId, contratoDeLocacaoId },
        orderBy: { criadoEm: 'desc' },
      });
      return registros.map(paraAcesso);
    });
  }

  // Rota pública (US-113/RN-413) - sem JWT, sem tenant conhecido de
  // antemão. Resolve o tenant a partir do PRÓPRIO token (política de RLS
  // "acesso_portal_contrato_leitura_por_token", ver migration) e só then
  // troca para o contexto de tenant normal (TenantPrismaService.run) pra
  // ler o resto do contrato. Erro genérico sempre - nunca revela se o token
  // é inválido, expirado ou revogado (mesmo espírito de LoginLockoutService:
  // nunca vazar informação por diferença de mensagem).
  async consultar(token: string): Promise<PortalContratoResumo> {
    const acesso = await this.prisma.acessoPortalContrato.findFirst({
      where: { tokenHash: hashToken(token), revogadoEm: null },
    });
    if (!acesso) {
      throw new NotFoundException('Acesso de portal não encontrado ou expirado.');
    }

    return this.tenantPrisma.run(acesso.tenantId, async (tx) => {
      const contrato = await tx.contratoDeLocacao.findFirst({
        where: { id: acesso.contratoDeLocacaoId, tenantId: acesso.tenantId },
      });
      if (!contrato) {
        throw new NotFoundException('Acesso de portal não encontrado ou expirado.');
      }
      const administracao = await tx.contratoDeAdministracao.findFirst({
        where: { id: contrato.contratoDeAdministracaoId, tenantId: acesso.tenantId },
      });
      const imovel = administracao
        ? await tx.imovel.findFirst({ where: { id: administracao.imovelId, tenantId: acesso.tenantId } })
        : null;

      const [documentos, vistorias, reajustes, renovacoes] = await Promise.all([
        tx.documentoDeContrato.findMany({ where: { tenantId: acesso.tenantId, contratoDeLocacaoId: contrato.id }, orderBy: { criadoEm: 'desc' } }),
        tx.vistoria.findMany({ where: { tenantId: acesso.tenantId, contratoDeLocacaoId: contrato.id }, orderBy: { dataHora: 'asc' } }),
        tx.reajuste.findMany({ where: { tenantId: acesso.tenantId, contratoDeLocacaoId: contrato.id }, orderBy: { competencia: 'desc' } }),
        tx.renovacao.findMany({ where: { tenantId: acesso.tenantId, contratoDeLocacaoId: contrato.id }, orderBy: { criadoEm: 'desc' } }),
      ]);

      return {
        contratoDeLocacaoId: contrato.id,
        enderecoImovel: imovel?.enderecoResumo ?? '—',
        estado: contrato.estado,
        valorAluguel: contrato.valorAluguel.toNumber(),
        diaVencimento: contrato.diaVencimento,
        indiceReajuste: contrato.indiceReajuste,
        vencimentoAtual: contrato.vencimentoAtual.toISOString().slice(0, 10),
        // anexadoPorUsuarioId/realizadoPorUsuarioId removidos - ID interno
        // de Usuario (staff) sem utilidade legítima pro titular externo,
        // que só tem um token, sem autenticação nenhuma (correção de
        // segurança registrada, revisão de 2026-08-08).
        documentos: documentos.map(paraDocumento).map(({ anexadoPorUsuarioId: _anexadoPorUsuarioId, ...resto }) => resto),
        vistorias: vistorias.map(paraVistoria).map(({ realizadoPorUsuarioId: _realizadoPorUsuarioId, ...resto }) => resto),
        reajustes: reajustes.map(paraReajuste),
        renovacoes: renovacoes.map(paraRenovacao),
      };
    });
  }
}
