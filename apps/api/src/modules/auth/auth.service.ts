import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { Prisma, Usuario as UsuarioRecord } from '@prisma/client';
import { LoginInput, LoginResultado, RefreshTokenInput, Usuario } from '@crm/shared';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { JwtPayload } from '../../common/auth/jwt-payload.interface';

// Access token curto (antes 12h fixas, sem renovação - ver README,
// "Pendências conhecidas de autenticação"): agora a sessão de fato dura
// REFRESH_TOKEN_TTL, renovada silenciosamente pelo front-end via
// /auth/refresh: o access token só precisa sobreviver entre duas renovações.
const ACCESS_TOKEN_TTL = '1h';
// Hipótese de trabalho (mesmo espírito dos outros prazos "hipótese" deste
// projeto, ex. SLA de transferência de carteira) - sem uma decisão de
// produto formal sobre por quanto tempo uma sessão inativa deve durar.
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
  };
}

// SHA-256, não bcrypt: o refresh token é um segredo de alta entropia gerado
// por nós (JWT assinado), não uma senha de usuário - não precisa de custo
// computacional para resistir a força-bruta, só precisa não ser reversível
// se o banco vazar. Também permite localizar a linha por igualdade direta
// (bcrypt teria salt diferente a cada hash, impossibilitando o lookup).
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // US-002/US-003 (ART-014): mensagem de erro deliberadamente genérica em
  // todos os casos de falha (e-mail inexistente, senha errada, usuário sem
  // senha cadastrada, usuário INATIVO/DESLIGADO) - simplificação registrada
  // para não vazar se um e-mail existe ou o motivo exato da rejeição.
  async login(input: LoginInput): Promise<LoginResultado> {
    return this.tenantPrisma.run(input.tenantId, async (tx) => {
      const usuario = await tx.usuario.findFirst({ where: { tenantId: input.tenantId, email: input.email } });
      if (!usuario || !usuario.senhaHash || usuario.status !== 'ATIVO') {
        throw new UnauthorizedException('E-mail ou senha inválidos, ou usuário sem acesso.');
      }

      const senhaValida = await bcrypt.compare(input.senha, usuario.senhaHash);
      if (!senhaValida) {
        throw new UnauthorizedException('E-mail ou senha inválidos, ou usuário sem acesso.');
      }

      const { accessToken, refreshToken } = await this.emitirTokens(tx, usuario);
      return { accessToken, refreshToken, usuario: paraUsuario(usuario) };
    });
  }

  // Fecha a pendência "sem refresh token" (README). Rotação a cada uso: o
  // refresh token recebido é revogado e um novo é emitido junto com o novo
  // access token - reuso de um refresh token já revogado é tratado como
  // sinal de possível token roubado (nunca emite novos tokens nesse caso,
  // mesmo que a assinatura JWT em si ainda seja válida e não tenha expirado).
  async refresh(input: RefreshTokenInput): Promise<LoginResultado> {
    const payload = this.verificarRefreshToken(input.refreshToken);

    return this.tenantPrisma.run(payload.tenantId, async (tx) => {
      const usuario = await tx.usuario.findFirst({ where: { id: payload.sub, tenantId: payload.tenantId } });
      if (!usuario || usuario.status !== 'ATIVO') {
        throw new UnauthorizedException('Sessão inválida — usuário inativo ou desligado.');
      }

      const tokenHash = hashToken(input.refreshToken);
      const registro = await tx.refreshToken.findFirst({
        where: { tenantId: payload.tenantId, usuarioId: usuario.id, tokenHash, revogadoEm: null },
      });
      if (!registro || registro.expiraEm < new Date()) {
        throw new UnauthorizedException('Refresh token inválido ou expirado.');
      }

      await tx.refreshToken.update({ where: { id: registro.id }, data: { revogadoEm: new Date() } });

      const { accessToken, refreshToken } = await this.emitirTokens(tx, usuario);
      return { accessToken, refreshToken, usuario: paraUsuario(usuario) };
    });
  }

  // Logout é sempre silencioso/idempotente (nunca lança) - um refresh token
  // já expirado/inválido/inexistente não é um erro no contexto de "encerrar
  // a sessão", o resultado desejado (token não utilizável) já vale.
  async logout(input: RefreshTokenInput): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(input.refreshToken);
    } catch {
      return;
    }

    await this.tenantPrisma.run(payload.tenantId, async (tx) => {
      await tx.refreshToken.updateMany({
        where: { tenantId: payload.tenantId, usuarioId: payload.sub, tokenHash: hashToken(input.refreshToken), revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
    });
  }

  private verificarRefreshToken(refreshToken: string): JwtPayload {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }
    return payload;
  }

  private async emitirTokens(
    tx: Prisma.TransactionClient,
    usuario: UsuarioRecord,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const claims = { sub: usuario.id, tenantId: usuario.tenantId, unidadeId: usuario.unidadeId, perfil: usuario.perfil };
    // jti (JWT ID) garante que dois tokens nunca colidem em texto, mesmo
    // assinados no mesmo segundo (iat) para o mesmo usuário com as mesmas
    // claims - sem isso, a assinatura HMAC é determinística e duas chamadas
    // de refresh() muito próximas no tempo poderiam gerar o MESMO texto de
    // token, quebrando a detecção de reuso (hash igual, linha ativa e
    // revogada indistinguíveis por conteúdo).
    const accessToken = this.jwtService.sign({ ...claims, typ: 'access', jti: randomUUID() }, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = this.jwtService.sign({ ...claims, typ: 'refresh', jti: randomUUID() }, { expiresIn: REFRESH_TOKEN_TTL });

    await tx.refreshToken.create({
      data: {
        tenantId: usuario.tenantId,
        usuarioId: usuario.id,
        tokenHash: hashToken(refreshToken),
        expiraEm: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }
}
