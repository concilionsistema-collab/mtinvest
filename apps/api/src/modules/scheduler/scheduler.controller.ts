import { Controller, Get, Headers, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth/public.decorator';
import { SchedulerService } from './scheduler.service';

// Gatilho HTTP para SchedulerService.executarVarreduraAutomatica() - mesma
// logica que o @Cron interno da classe ja roda a cada 5 minutos, mas
// disparavel sob demanda. Necessario pra hospedagem serverless (Vercel):
// la a funcao "desliga" entre requisicoes, entao um @Cron em processo (que
// depende do processo ficar sempre vivo) nunca teria chance de disparar -
// quem chama esta rota de verdade em producao e o Vercel Cron Job
// configurado em vercel.json ("crons"), que no plano free roda 1x/dia
// (aceitavel: os prazos processados sao de 48h a 180 dias, ver comentario
// em scheduler.service.ts). Continua existindo em paralelo ao @Cron - em
// hospedagem tradicional (processo sempre ligado) os dois convivem sem
// conflito, a varredura so roda duas vezes seguidas sem problema (idempotente
// por natureza: cada checagem so age em registros que already estao vencidos).
@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  // @Public(): quem chama e a propria infraestrutura (Vercel Cron), nunca um
  // usuario com sessao - por isso a autenticacao aqui e um segredo
  // compartilhado (CRON_SECRET), nao um JWT. @SkipThrottle(): mesma razao do
  // /health, chamada de infraestrutura nao deve contar no limite por IP.
  //
  // Autenticacao: a Vercel injeta automaticamente o header
  // "Authorization: Bearer <CRON_SECRET>" nas chamadas que ela mesma faz
  // pros paths declarados em "crons" (convencao documentada da propria
  // Vercel), quando a env var CRON_SECRET esta definida no projeto. Sem essa
  // checagem, qualquer pessoa na internet poderia disparar a varredura
  // completa (ela escreve no banco de TODOS os tenants ativos).
  @Public()
  @SkipThrottle()
  @Get('varredura')
  @HttpCode(HttpStatus.NO_CONTENT)
  async varredura(@Headers('authorization') authorization?: string): Promise<void> {
    const segredo = process.env.CRON_SECRET;
    if (!segredo || authorization !== `Bearer ${segredo}`) {
      throw new UnauthorizedException();
    }
    await this.schedulerService.executarVarreduraAutomatica();
  }
}
