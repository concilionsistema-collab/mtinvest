import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CriarTenantInput, CriarTenantResultado, Usuario as UsuarioShared } from '@crm/shared';
import { Usuario as UsuarioRecord } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

const CUSTO_HASH_SENHA = 10;
const TRIAL_DIAS = 14;

function paraUsuario(registro: UsuarioRecord): UsuarioShared {
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

// EXTENSAO REGISTRADA (onboarding self-service, "bloqueador P0 pra revenda"
// do README): antes desta fatia, um tenant novo so podia ser provisionado
// manualmente via SQL/script (apps/api/scripts/gerar-hash-senha.js) - todo
// cliente novo exigia intervencao manual. Isso fecha essa lacuna: qualquer
// visitante cria tenant + unidade matriz + usuario GESTOR_UNIDADE + sessao
// valida numa unica chamada publica, sem aprovacao humana. A cobranca real
// (BillingModule) e independente disto: o tenant nasce em TRIAL e so vira
// bloqueado depois que TenantAssinaturaStatus.trialFimEm passa sem uma
// assinatura Stripe ativa (ver BillingGuard).
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly authService: AuthService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async criar(input: CriarTenantInput): Promise<CriarTenantResultado> {
    // Tenant nao e tenant-scoped (e a propria raiz, ver schema.prisma) - por
    // isso usa PrismaService puro aqui, nunca TenantPrismaService.run (que
    // exigiria um tenant_id que ainda nao existe).
    const existente = await this.prisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (existente) {
      throw new ConflictException('Esse identificador já está em uso. Escolha outro.');
    }

    const trialFimEm = new Date(Date.now() + TRIAL_DIAS * 24 * 60 * 60 * 1000);
    const senhaHash = await bcrypt.hash(input.senha, CUSTO_HASH_SENHA);

    const tenant = await this.prisma.tenant.create({
      data: {
        id: input.tenantId,
        razaoSocial: input.razaoSocial,
        assinaturaStatus: 'TRIAL',
        trialFimEm,
      },
    });

    // Unidade e Usuario JA sao tenant-scoped (RLS) - dai pra frente, sempre
    // dentro de tenantPrisma.run com o tenant que acabou de nascer.
    const usuario = await this.tenantPrisma.run(tenant.id, async (tx) => {
      const unidade = await tx.unidade.create({
        data: { tenantId: tenant.id, nomeFantasia: 'Matriz', eMatriz: true },
      });

      const criado = await tx.usuario.create({
        data: {
          tenantId: tenant.id,
          unidadeId: unidade.id,
          nome: input.nomeAdmin,
          email: input.email,
          senhaHash,
          perfil: 'GESTOR_UNIDADE',
        },
      });

      await this.auditoriaService.registrarTx(
        tx,
        tenant.id,
        criado.id,
        'TENANT_CRIADO',
        'Tenant',
        tenant.id,
        `self-signup - trial ate ${trialFimEm.toISOString()}`,
      );

      return criado;
    });

    // emitirTokens grava o refresh token na tabela refresh_token
    // (tenant-scoped) - roda dentro de outra chamada a tenantPrisma.run,
    // ja que a anterior fechou ao retornar `usuario`.
    const { accessToken, refreshToken } = await this.tenantPrisma.run(tenant.id, (tx) =>
      this.authService.emitirTokens(tx, usuario),
    );

    return { accessToken, refreshToken, usuario: paraUsuario(usuario), trialFimEm: trialFimEm.toISOString() };
  }
}
