import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';

// Cobre US-002/US-003 (ART-014) - o guard e o ponto real onde US-003 (CA-001,
// bloqueio automatico de usuario desligado) e aplicado a cada requisicao.
describe('JwtAuthGuard', () => {
  function criarContexto(headers: Record<string, string>) {
    const request: Record<string, unknown> = {
      header: (nome: string) => headers[nome.toLowerCase()],
    };
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext & { _request: typeof request };
  }

  function criarGuard(opts: {
    isPublic?: boolean;
    verify?: jest.Mock;
    usuarioFindFirst?: jest.Mock;
  }) {
    const jwtService = { verify: opts.verify ?? jest.fn() } as unknown as JwtService;
    const tenantPrisma = {
      run: jest.fn((_tenantId: string, work: (tx: unknown) => unknown) =>
        work({ usuario: { findFirst: opts.usuarioFindFirst ?? jest.fn() } }),
      ),
    } as unknown as TenantPrismaService;
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(opts.isPublic ?? false) } as unknown as Reflector;

    return new JwtAuthGuard(jwtService, tenantPrisma, reflector);
  }

  it('libera endpoints marcados @Public() sem exigir token', async () => {
    const guard = criarGuard({ isPublic: true });
    const contexto = criarContexto({});

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
  });

  it('rejeita requisicao sem header Authorization', async () => {
    const guard = criarGuard({});
    const contexto = criarContexto({});

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita token invalido/expirado', async () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new Error('invalido');
    });
    const guard = criarGuard({ verify });
    const contexto = criarContexto({ authorization: 'Bearer token-invalido' });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('US-003, CA-001: rejeita quando o usuario do token foi desligado (reconsulta ao vivo)', async () => {
    const verify = jest
      .fn()
      .mockReturnValue({ sub: 'usr1', tenantId: 't1', unidadeId: 'un-A', perfil: 'CORRETOR', typ: 'access' });
    const usuarioFindFirst = jest.fn().mockResolvedValue({ id: 'usr1', tenantId: 't1', status: 'DESLIGADO' });
    const guard = criarGuard({ verify, usuarioFindFirst });
    const contexto = criarContexto({ authorization: 'Bearer token-valido' });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('aceita token valido de usuario ATIVO e preenche request.usuarioAutenticado', async () => {
    const verify = jest
      .fn()
      .mockReturnValue({ sub: 'usr1', tenantId: 't1', unidadeId: 'un-A', perfil: 'CORRETOR', typ: 'access' });
    const usuarioFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'usr1', tenantId: 't1', unidadeId: 'un-A', perfil: 'CORRETOR', status: 'ATIVO' });
    const guard = criarGuard({ verify, usuarioFindFirst });
    const contexto = criarContexto({ authorization: 'Bearer token-valido' });

    const resultado = await guard.canActivate(contexto);

    expect(resultado).toBe(true);
    const request = contexto.switchToHttp().getRequest() as { usuarioAutenticado?: unknown };
    expect(request.usuarioAutenticado).toEqual({
      id: 'usr1',
      tenantId: 't1',
      unidadeId: 'un-A',
      perfil: 'CORRETOR',
    });
  });

  it('rejeita um refresh token usado diretamente como access token (typ != access)', async () => {
    const verify = jest
      .fn()
      .mockReturnValue({ sub: 'usr1', tenantId: 't1', unidadeId: 'un-A', perfil: 'CORRETOR', typ: 'refresh' });
    const usuarioFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'usr1', tenantId: 't1', unidadeId: 'un-A', perfil: 'CORRETOR', status: 'ATIVO' });
    const guard = criarGuard({ verify, usuarioFindFirst });
    const contexto = criarContexto({ authorization: 'Bearer refresh-token-vazado' });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usuarioFindFirst).not.toHaveBeenCalled();
  });
});
