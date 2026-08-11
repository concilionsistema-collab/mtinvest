import { UnauthorizedException } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';

// Gatilho HTTP do Vercel Cron (ver comentario em scheduler.controller.ts) -
// o unico comportamento que importa testar aqui e a autenticacao por
// segredo: a logica da varredura em si ja e coberta por scheduler.service.spec.ts.
describe('SchedulerController - varredura (gatilho do Vercel Cron)', () => {
  const ambienteOriginal = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = ambienteOriginal;
  });

  function criarController(executarVarreduraAutomatica = jest.fn().mockResolvedValue(undefined)) {
    const service = { executarVarreduraAutomatica } as unknown as SchedulerService;
    return { controller: new SchedulerController(service), executarVarreduraAutomatica };
  }

  it('roda a varredura quando o header bate com CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'segredo-de-teste';
    const { controller, executarVarreduraAutomatica } = criarController();

    await controller.varredura('Bearer segredo-de-teste');

    expect(executarVarreduraAutomatica).toHaveBeenCalledTimes(1);
  });

  it('rejeita (401) quando o header nao bate com CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'segredo-de-teste';
    const { controller, executarVarreduraAutomatica } = criarController();

    await expect(controller.varredura('Bearer segredo-errado')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(executarVarreduraAutomatica).not.toHaveBeenCalled();
  });

  it('rejeita (401) quando nenhum header e enviado', async () => {
    process.env.CRON_SECRET = 'segredo-de-teste';
    const { controller, executarVarreduraAutomatica } = criarController();

    await expect(controller.varredura(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(executarVarreduraAutomatica).not.toHaveBeenCalled();
  });

  it('rejeita (401) quando CRON_SECRET nao esta configurado no ambiente - nunca aceita "sem segredo bate com sem segredo"', async () => {
    delete process.env.CRON_SECRET;
    const { controller, executarVarreduraAutomatica } = criarController();

    await expect(controller.varredura(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(executarVarreduraAutomatica).not.toHaveBeenCalled();
  });
});
