import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Usuario as UsuarioRecord, OportunidadeEstado } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AlterarSenhaInput, CriarUsuarioInput, Usuario } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { UsuarioAutenticado } from '../../common/auth/usuario-autenticado';
import { LeadsService } from '../leads/leads.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

const CUSTO_HASH_SENHA = 10;

// RN-009 (ART-004): "proposta em analise" (PROPOSTA_ENVIADA/EM_CONTRAPROPOSTA),
// "visita confirmada nao realizada" (VISITA_CONFIRMADA) ou "reserva ativa"
// (RESERVA). EXTENSAO REGISTRADA: RN-009 nao cita DOCUMENTACAO_CONCLUIDA
// (estagio de ART-009 posterior a RESERVA, que nao existia quando RN-009 foi
// escrita) - incluido aqui porque seria inconsistente considerar RESERVA
// avancada e o estagio seguinte nao. Lista definitiva ainda pendente de
// ratificacao formal em DEC-NEG-005.
const ESTAGIOS_AVANCADOS: OportunidadeEstado[] = [
  'VISITA_CONFIRMADA',
  'PROPOSTA_ENVIADA',
  'EM_CONTRAPROPOSTA',
  'RESERVA',
  'DOCUMENTACAO_CONCLUIDA',
];

// RN-008 (ART-004): valor sugerido de 5 dias uteis, hipotese de trabalho ate
// DEC-NEG-005 ser aprovada. SIMPLIFICACAO: contado em dias corridos, nao
// uteis (sem calendario de feriados/fins de semana nesta fatia).
const DIAS_SLA_DECISAO_TRANSFERENCIA = 5;

function paraUsuario(registro: UsuarioRecord): Usuario {
  return {
    id: registro.id,
    tenantId: registro.tenantId,
    unidadeId: registro.unidadeId,
    nome: registro.nome,
    email: registro.email,
    perfil: registro.perfil,
    status: registro.status,
    criadoEm: registro.criadoEm.toISOString(),
    temFotoPerfil: registro.fotoPerfilTipo != null,
  };
}

export interface FotoDeUsuario {
  bytes: Buffer;
  contentType: string;
}

@Injectable()
export class UsuariosService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly leadsService: LeadsService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // US-002 (ART-014) / RN-101, RN-102 (ART-006): so concede perfil dentro do
  // escopo do concedente. CA-001: o novo usuario so pode ser criado na
  // mesma unidade do concedente (nunca em outra, "escopo da minha unidade,
  // nunca de toda a rede"). CA-002: conceder o perfil critico GESTOR_UNIDADE
  // exige que o proprio concedente ja seja GESTOR_UNIDADE - sem isso, e
  // rejeitado mesmo que a chamada chegue direto na API.
  // SIMPLIFICACAO REGISTRADA: ART-006 tem 16 perfis e uma matriz completa de
  // alcada; este sistema so distingue GESTOR_UNIDADE e CORRETOR (ver
  // UsuarioPerfil, schema.prisma) - ver comentario no enum.
  async criar(tenantId: string, concedente: UsuarioAutenticado, input: CriarUsuarioInput): Promise<Usuario> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      if (input.unidadeId !== concedente.unidadeId) {
        throw new BadRequestException(
          'Só é possível conceder perfil dentro da própria unidade (CA-001, US-002).',
        );
      }
      const perfilDesejado = input.perfil ?? 'CORRETOR';
      if (perfilDesejado === 'GESTOR_UNIDADE' && concedente.perfil !== 'GESTOR_UNIDADE') {
        throw new BadRequestException(
          'Sem alçada para conceder o perfil "Gestor de unidade" (CA-002, US-002; RN-102, ART-006).',
        );
      }

      const unidade = await tx.unidade.findFirst({ where: { id: input.unidadeId, tenantId } });
      if (!unidade) {
        throw new BadRequestException('A unidade informada não existe ou não pertence a este tenant.');
      }

      const senhaHash = await bcrypt.hash(input.senha, CUSTO_HASH_SENHA);
      const criado = await tx.usuario.create({
        data: {
          tenantId,
          unidadeId: input.unidadeId,
          nome: input.nome,
          email: input.email,
          senhaHash,
          perfil: perfilDesejado,
        },
      });

      // Auditoria (US-002, "toda concessão gera RegistroDeAuditoria", RN-101).
      await this.auditoriaService.registrarTx(
        tx,
        tenantId,
        concedente.id,
        'PERFIL_CONCEDIDO',
        'Usuario',
        criado.id,
        `perfil=${perfilDesejado}`,
      );

      return paraUsuario(criado);
    });
  }

  async listar(tenantId: string): Promise<Usuario[]> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const registros = await tx.usuario.findMany({ where: { tenantId }, orderBy: { criadoEm: 'asc' } });
      return registros.map(paraUsuario);
    });
  }

  // Base da tela "Configurações" (dados da própria conta do usuário logado).
  async obterPerfil(tenantId: string, usuarioId: string): Promise<Usuario> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const usuario = await tx.usuario.findFirst({ where: { id: usuarioId, tenantId } });
      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado neste tenant.');
      }
      return paraUsuario(usuario);
    });
  }

  // EXTENSAO REGISTRADA (menu "Configurações"): troca de senha da própria
  // conta - exige a senha atual (CA implícito: nunca troca sem confirmar a
  // senha vigente), sempre sobre o próprio usuarioId do chamador (nunca um
  // id enviado pelo cliente, evita trocar senha de outra pessoa).
  async alterarSenha(tenantId: string, usuarioId: string, input: AlterarSenhaInput): Promise<void> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const usuario = await tx.usuario.findFirst({ where: { id: usuarioId, tenantId } });
      if (!usuario || !usuario.senhaHash) {
        throw new NotFoundException('Usuário não encontrado neste tenant.');
      }

      const senhaValida = await bcrypt.compare(input.senhaAtual, usuario.senhaHash);
      if (!senhaValida) {
        throw new UnauthorizedException('Senha atual incorreta.');
      }

      const novoHash = await bcrypt.hash(input.novaSenha, CUSTO_HASH_SENHA);
      await tx.usuario.update({ where: { id: usuarioId }, data: { senhaHash: novoHash } });
    });
  }

  // US-010 (ART-014) / RN-008/RN-009 (ART-004): desliga o usuario. Leads sob
  // sua responsabilidade sem estagio avancado (CA-001) sao liberados e
  // redistribuidos automaticamente pela mesma regra de US-008. Leads com uma
  // Oportunidade ativa em estagio avancado (CA-002, ESTAGIOS_AVANCADOS) NAO
  // sao redistribuidos automaticamente - entram em fila de decisao do
  // gestor via TransferenciaDeCarteira (CarteirasService.decidir), com SLA.
  async desligar(tenantId: string, usuarioId: string, atorUsuarioId: string): Promise<Usuario> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const usuario = await tx.usuario.findFirst({ where: { id: usuarioId, tenantId } });
      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado neste tenant.');
      }

      const atualizado = await tx.usuario.update({
        where: { id: usuarioId },
        data: { status: 'DESLIGADO' },
      });

      // Auditoria (US-003, "bloqueio gera RegistroDeAuditoria").
      await this.auditoriaService.registrarTx(tx, tenantId, atorUsuarioId, 'USUARIO_DESLIGADO', 'Usuario', usuarioId);

      const leadsAfetados = await tx.lead.findMany({
        where: { tenantId, responsavelUsuarioId: usuarioId, estado: { in: ['DISTRIBUIDO', 'EM_ATENDIMENTO'] } },
      });

      for (const lead of leadsAfetados) {
        const oportunidadeAvancada = await tx.oportunidade.findFirst({
          where: { tenantId, leadId: lead.id, estado: { in: ESTAGIOS_AVANCADOS } },
        });

        if (oportunidadeAvancada) {
          // CA-002: item em estagio avancado NAO e transferido automaticamente -
          // entra em fila de decisao do gestor (RN-008/RN-009).
          await tx.transferenciaDeCarteira.create({
            data: {
              tenantId,
              leadId: lead.id,
              origemUsuarioId: usuarioId,
              estado: 'PENDENTE',
              motivo: `desligamento do responsavel com oportunidade em estagio avancado (${oportunidadeAvancada.estado}) - RN-008/RN-009`,
              slaDecisaoFim: new Date(Date.now() + DIAS_SLA_DECISAO_TRANSFERENCIA * 24 * 60 * 60 * 1000),
            },
          });

          // ART-005, secao 9: escrita em TransferenciaDeCarteira.estado gera RegistroDeAuditoria.
          await this.auditoriaService.registrarTx(
            tx,
            tenantId,
            atorUsuarioId,
            'TRANSFERENCIA_CARTEIRA_PENDENTE',
            'Lead',
            lead.id,
            `aguardando decisao do gestor apos desligamento (estagio ${oportunidadeAvancada.estado})`,
          );
          continue;
        }

        const liberado = await tx.lead.update({
          where: { id: lead.id },
          data: { estado: 'EM_FILA_DE_DISTRIBUICAO', responsavelUsuarioId: null, janelaExclusividadeFim: null },
        });

        // ART-005, secao 9: escrita em Lead.estado gera RegistroDeAuditoria.
        // Diferente da distribuicao automatica em captura (sem ator humano),
        // aqui o ator e quem desligou o usuario - passado para distribuirLead,
        // que agora audita a propria escrita (EM_FILA_DE_DISTRIBUICAO->DISTRIBUIDO)
        // com o ator correto, sem duplicar aqui.
        await this.leadsService.distribuirLead(tx, tenantId, liberado, atorUsuarioId);
      }

      return paraUsuario(atualizado);
    });
  }

  // EXTENSAO REGISTRADA (tela "Equipe"): guarda a foto no proprio Postgres -
  // ver comentario em schema.prisma (Usuario.fotoPerfil) sobre o porque de
  // nao usar disco. Mesmo padrao de tenant-scoping dos demais metodos:
  // findFirst({id, tenantId}) antes do update, para responder 404 (nao um
  // erro de update em linha inexistente) quando o id nao pertence a este
  // tenant - a RLS ja impediria o vazamento entre tenants de qualquer forma,
  // isto so torna o erro claro na camada da aplicacao.
  async salvarFoto(tenantId: string, usuarioId: string, bytes: Buffer, contentType: string): Promise<void> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const usuario = await tx.usuario.findFirst({ where: { id: usuarioId, tenantId } });
      if (!usuario) {
        throw new NotFoundException('Usuário não encontrado neste tenant.');
      }

      await tx.usuario.update({
        where: { id: usuarioId },
        data: { fotoPerfil: bytes, fotoPerfilTipo: contentType, fotoPerfilAtualizadaEm: new Date() },
      });
    });
  }

  // Retorna null (nunca lança) quando o usuário não tem foto - a rota HTTP
  // trata isso como 404 simples, o mesmo estado de "sem foto ainda".
  async obterFoto(tenantId: string, usuarioId: string): Promise<FotoDeUsuario | null> {
    return this.tenantPrisma.run(tenantId, async (tx) => {
      const usuario = await tx.usuario.findFirst({ where: { id: usuarioId, tenantId } });
      if (!usuario || !usuario.fotoPerfil || !usuario.fotoPerfilTipo) {
        return null;
      }
      return { bytes: Buffer.from(usuario.fotoPerfil), contentType: usuario.fotoPerfilTipo };
    });
  }
}
