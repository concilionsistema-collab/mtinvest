import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { TenantPrismaService } from '../../common/tenant/tenant-prisma.service';
import { LoginLockoutService } from './login-lockout.service';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// jwtService.sign real (não mockado) faria mais sentido para ver o payload
// de verdade, mas manter mockado é consistente com o resto da suíte -
// aqui simulamos assinatura devolvendo um token diferente por `typ`.
function criarJwtServiceMock() {
  const sign = jest.fn().mockImplementation((payload: { typ: string }) =>
    payload.typ === 'access' ? 'access-token-assinado' : 'refresh-token-assinado',
  );
  const verify = jest.fn();
  return { sign, verify } as unknown as JwtService;
}

function criarServico(
  tx: {
    usuarioFindFirst?: jest.Mock;
    refreshTokenCreate?: jest.Mock;
    refreshTokenFindFirst?: jest.Mock;
    refreshTokenUpdate?: jest.Mock;
    refreshTokenUpdateMany?: jest.Mock;
  },
  loginLockout: LoginLockoutService = new LoginLockoutService(),
) {
  const tenantPrisma = {
    run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
      work({
        usuario: { findFirst: tx.usuarioFindFirst },
        refreshToken: {
          create: tx.refreshTokenCreate ?? jest.fn().mockResolvedValue({}),
          findFirst: tx.refreshTokenFindFirst,
          update: tx.refreshTokenUpdate,
          updateMany: tx.refreshTokenUpdateMany,
        },
      }),
    ),
  } as unknown as TenantPrismaService;
  const jwtService = criarJwtServiceMock();

  return { service: new AuthService(tenantPrisma, jwtService, loginLockout), jwtService, loginLockout };
}

const usuarioBase = {
  id: 'usr1',
  tenantId: 'tenant-1',
  unidadeId: 'un-A',
  nome: 'Corretor Teste',
  email: 'teste@crm.com',
  perfil: 'CORRETOR',
  status: 'ATIVO',
  criadoEm: new Date('2026-08-01T00:00:00.000Z'),
};

// Cobre US-002/US-003 (ART-014, EPIC-01 - Identidade e fundação).
describe('AuthService - login', () => {
  const tenantId = 'tenant-1';

  it('autentica com e-mail/senha corretos e emite access token + refresh token', async () => {
    const senhaHash = await bcrypt.hash('senha-correta', 4);
    const usuarioFindFirst = jest.fn().mockResolvedValue({ ...usuarioBase, senhaHash });
    const refreshTokenCreate = jest.fn().mockResolvedValue({});
    const { service, jwtService } = criarServico({ usuarioFindFirst, refreshTokenCreate });

    const resultado = await service.login({ tenantId, email: 'teste@crm.com', senha: 'senha-correta' });

    expect(resultado.accessToken).toBe('access-token-assinado');
    expect(resultado.refreshToken).toBe('refresh-token-assinado');
    expect(resultado.usuario.email).toBe('teste@crm.com');
    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR', typ: 'access', jti: expect.any(String) },
      { expiresIn: '1h' },
    );
    expect(jwtService.sign).toHaveBeenCalledWith(
      { sub: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR', typ: 'refresh', jti: expect.any(String) },
      { expiresIn: '30d' },
    );
    // o refresh token é persistido (hash) para poder ser revogado/rotacionado depois:
    expect(refreshTokenCreate).toHaveBeenCalledWith({
      data: {
        tenantId,
        usuarioId: 'usr1',
        tokenHash: hashToken('refresh-token-assinado'),
        expiraEm: expect.any(Date),
      },
    });
  });

  it('rejeita senha incorreta', async () => {
    const senhaHash = await bcrypt.hash('senha-correta', 4);
    const usuarioFindFirst = jest.fn().mockResolvedValue({ ...usuarioBase, senhaHash });
    const { service } = criarServico({ usuarioFindFirst });

    await expect(
      service.login({ tenantId, email: 'teste@crm.com', senha: 'senha-errada' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita e-mail inexistente', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue(null);
    const { service } = criarServico({ usuarioFindFirst });

    await expect(
      service.login({ tenantId, email: 'nao-existe@crm.com', senha: 'qualquer' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('US-003, CA-001: rejeita usuario DESLIGADO mesmo com senha correta', async () => {
    const senhaHash = await bcrypt.hash('senha-correta', 4);
    const usuarioFindFirst = jest.fn().mockResolvedValue({ ...usuarioBase, senhaHash, status: 'DESLIGADO' });
    const { service } = criarServico({ usuarioFindFirst });

    await expect(
      service.login({ tenantId, email: 'teste@crm.com', senha: 'senha-correta' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita usuario sem senha cadastrada (legado pre-migration)', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue({ ...usuarioBase, senhaHash: null });
    const { service } = criarServico({ usuarioFindFirst });

    await expect(
      service.login({ tenantId, email: 'legado@crm.com', senha: 'qualquer' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

// Fecha a pendência "sem rate limiting" (README) do lado de bloqueio por conta.
describe('AuthService - bloqueio por tentativas (LoginLockoutService)', () => {
  const tenantId = 'tenant-1';

  it('rejeita login mesmo com senha correta quando a conta está bloqueada', async () => {
    const senhaHash = await bcrypt.hash('senha-correta', 4);
    const usuarioFindFirst = jest.fn().mockResolvedValue({ ...usuarioBase, senhaHash });
    const loginLockout = new LoginLockoutService();
    for (let i = 0; i < 5; i += 1) {
      loginLockout.registrarFalha(tenantId, 'teste@crm.com');
    }
    const { service } = criarServico({ usuarioFindFirst }, loginLockout);

    await expect(
      service.login({ tenantId, email: 'teste@crm.com', senha: 'senha-correta' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // bloqueado ANTES de sequer consultar o usuario no banco:
    expect(usuarioFindFirst).not.toHaveBeenCalled();
  });

  it('registra falha ao errar a senha, e a 5a tentativa bloqueia as seguintes', async () => {
    const senhaHash = await bcrypt.hash('senha-correta', 4);
    const usuarioFindFirst = jest.fn().mockResolvedValue({ ...usuarioBase, senhaHash });
    const loginLockout = new LoginLockoutService();
    const { service } = criarServico({ usuarioFindFirst }, loginLockout);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.login({ tenantId, email: 'teste@crm.com', senha: 'senha-errada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    // a 6a tentativa (mesmo com senha CORRETA agora) e barrada pelo bloqueio, nao pela senha:
    usuarioFindFirst.mockClear();
    await expect(
      service.login({ tenantId, email: 'teste@crm.com', senha: 'senha-correta' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usuarioFindFirst).not.toHaveBeenCalled();
  });

  it('login bem-sucedido limpa o contador de falhas anteriores', async () => {
    const senhaHash = await bcrypt.hash('senha-correta', 4);
    const usuarioFindFirst = jest.fn().mockResolvedValue({ ...usuarioBase, senhaHash });
    const loginLockout = new LoginLockoutService();
    const { service } = criarServico({ usuarioFindFirst }, loginLockout);

    for (let i = 0; i < 4; i += 1) {
      await expect(
        service.login({ tenantId, email: 'teste@crm.com', senha: 'senha-errada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(
      service.login({ tenantId, email: 'teste@crm.com', senha: 'senha-correta' }),
    ).resolves.toBeDefined();

    expect(loginLockout.estaBloqueado(tenantId, 'teste@crm.com')).toBe(false);
  });

  it('tambem conta falha (e pode bloquear) para e-mail inexistente - nao vaza se a conta existe', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue(null);
    const loginLockout = new LoginLockoutService();
    const { service } = criarServico({ usuarioFindFirst }, loginLockout);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.login({ tenantId, email: 'fantasma@crm.com', senha: 'qualquer' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    expect(loginLockout.estaBloqueado(tenantId, 'fantasma@crm.com')).toBe(true);
  });
});

// Fecha a pendência "sem refresh token" (README).
describe('AuthService - refresh', () => {
  const tenantId = 'tenant-1';
  const payloadValido = { sub: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR', typ: 'refresh' };

  it('rotaciona: revoga o refresh token recebido e emite um novo par de tokens', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue(usuarioBase);
    const refreshTokenFindFirst = jest.fn().mockResolvedValue({
      id: 'rt1',
      tenantId,
      usuarioId: 'usr1',
      tokenHash: hashToken('refresh-valido'),
      expiraEm: new Date(Date.now() + 1000 * 60 * 60),
      revogadoEm: null,
    });
    const refreshTokenUpdate = jest.fn().mockResolvedValue({});
    const refreshTokenCreate = jest.fn().mockResolvedValue({});
    const { service, jwtService } = criarServico({
      usuarioFindFirst,
      refreshTokenFindFirst,
      refreshTokenUpdate,
      refreshTokenCreate,
    });
    (jwtService.verify as jest.Mock).mockReturnValue(payloadValido);

    const resultado = await service.refresh({ refreshToken: 'refresh-valido' });

    expect(refreshTokenFindFirst).toHaveBeenCalledWith({
      where: { tenantId, usuarioId: 'usr1', tokenHash: hashToken('refresh-valido'), revogadoEm: null },
    });
    expect(refreshTokenUpdate).toHaveBeenCalledWith({ where: { id: 'rt1' }, data: { revogadoEm: expect.any(Date) } });
    expect(resultado.accessToken).toBe('access-token-assinado');
    expect(resultado.refreshToken).toBe('refresh-token-assinado');
  });

  it('rejeita assinatura/expiração de JWT inválida', async () => {
    const { service, jwtService } = criarServico({});
    (jwtService.verify as jest.Mock).mockImplementation(() => {
      throw new Error('expirado');
    });

    await expect(service.refresh({ refreshToken: 'lixo' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita um access token usado como refresh token (typ != refresh)', async () => {
    const { service, jwtService } = criarServico({});
    (jwtService.verify as jest.Mock).mockReturnValue({ ...payloadValido, typ: 'access' });

    await expect(service.refresh({ refreshToken: 'access-usado-como-refresh' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita quando o usuario foi desligado', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue({ ...usuarioBase, status: 'DESLIGADO' });
    const { service, jwtService } = criarServico({ usuarioFindFirst });
    (jwtService.verify as jest.Mock).mockReturnValue(payloadValido);

    await expect(service.refresh({ refreshToken: 'refresh-valido' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('detecta reuso de um refresh token já rotacionado/revogado (possível token roubado)', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue(usuarioBase);
    const refreshTokenFindFirst = jest.fn().mockResolvedValue(null); // já revogado, filtro revogadoEm:null não acha
    const refreshTokenCreate = jest.fn();
    const { service, jwtService } = criarServico({ usuarioFindFirst, refreshTokenFindFirst, refreshTokenCreate });
    (jwtService.verify as jest.Mock).mockReturnValue(payloadValido);

    await expect(service.refresh({ refreshToken: 'refresh-ja-usado' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('rejeita refresh token com expiraEm no passado (mesmo com linha ainda não revogada)', async () => {
    const usuarioFindFirst = jest.fn().mockResolvedValue(usuarioBase);
    const refreshTokenFindFirst = jest.fn().mockResolvedValue({
      id: 'rt1',
      tenantId,
      usuarioId: 'usr1',
      tokenHash: hashToken('refresh-vencido'),
      expiraEm: new Date(Date.now() - 1000),
      revogadoEm: null,
    });
    const { service, jwtService } = criarServico({ usuarioFindFirst, refreshTokenFindFirst });
    (jwtService.verify as jest.Mock).mockReturnValue(payloadValido);

    await expect(service.refresh({ refreshToken: 'refresh-vencido' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService - logout', () => {
  const tenantId = 'tenant-1';
  const payloadValido = { sub: 'usr1', tenantId, unidadeId: 'un-A', perfil: 'CORRETOR', typ: 'refresh' };

  it('revoga o refresh token informado', async () => {
    const refreshTokenUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { service, jwtService } = criarServico({ refreshTokenUpdateMany });
    (jwtService.verify as jest.Mock).mockReturnValue(payloadValido);

    await service.logout({ refreshToken: 'refresh-valido' });

    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { tenantId, usuarioId: 'usr1', tokenHash: hashToken('refresh-valido'), revogadoEm: null },
      data: { revogadoEm: expect.any(Date) },
    });
  });

  it('é silencioso (não lança) quando o token já é inválido/expirado', async () => {
    const { service, jwtService } = criarServico({});
    (jwtService.verify as jest.Mock).mockImplementation(() => {
      throw new Error('expirado');
    });

    await expect(service.logout({ refreshToken: 'lixo' })).resolves.toBeUndefined();
  });
});
