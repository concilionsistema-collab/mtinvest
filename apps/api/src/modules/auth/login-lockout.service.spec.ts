import { LoginLockoutService } from './login-lockout.service';

// Fecha a pendência "sem rate limiting" (README) do lado de bloqueio por conta.
describe('LoginLockoutService', () => {
  const tenantId = 'tenant-1';
  const email = 'usuario@teste.com';

  it('não bloqueia uma conta sem tentativas registradas', () => {
    const service = new LoginLockoutService();

    expect(service.estaBloqueado(tenantId, email)).toBe(false);
  });

  it('não bloqueia antes de atingir o limite de falhas', () => {
    const service = new LoginLockoutService();

    for (let i = 0; i < 4; i += 1) {
      service.registrarFalha(tenantId, email);
    }

    expect(service.estaBloqueado(tenantId, email)).toBe(false);
  });

  it('bloqueia ao atingir 5 falhas', () => {
    const service = new LoginLockoutService();

    for (let i = 0; i < 5; i += 1) {
      service.registrarFalha(tenantId, email);
    }

    expect(service.estaBloqueado(tenantId, email)).toBe(true);
  });

  it('limparFalhas (login bem-sucedido) remove o bloqueio', () => {
    const service = new LoginLockoutService();
    for (let i = 0; i < 5; i += 1) {
      service.registrarFalha(tenantId, email);
    }
    expect(service.estaBloqueado(tenantId, email)).toBe(true);

    service.limparFalhas(tenantId, email);

    expect(service.estaBloqueado(tenantId, email)).toBe(false);
  });

  it('contas diferentes (tenant ou e-mail) têm contadores independentes', () => {
    const service = new LoginLockoutService();
    for (let i = 0; i < 5; i += 1) {
      service.registrarFalha(tenantId, email);
    }

    expect(service.estaBloqueado('outro-tenant', email)).toBe(false);
    expect(service.estaBloqueado(tenantId, 'outro@teste.com')).toBe(false);
  });

  it('e-mail é comparado sem diferenciar maiúsculas/minúsculas', () => {
    const service = new LoginLockoutService();
    for (let i = 0; i < 5; i += 1) {
      service.registrarFalha(tenantId, 'Usuario@Teste.com');
    }

    expect(service.estaBloqueado(tenantId, 'usuario@teste.com')).toBe(true);
  });

  it('expira o bloqueio automaticamente após a duração configurada', () => {
    const agoraReal = Date.now;
    try {
      let agora = agoraReal();
      Date.now = () => agora;

      const service = new LoginLockoutService();
      for (let i = 0; i < 5; i += 1) {
        service.registrarFalha(tenantId, email);
      }
      expect(service.estaBloqueado(tenantId, email)).toBe(true);

      agora += 16 * 60 * 1000; // 16 min > duração do bloqueio (15 min)
      expect(service.estaBloqueado(tenantId, email)).toBe(false);
    } finally {
      Date.now = agoraReal;
    }
  });
});
