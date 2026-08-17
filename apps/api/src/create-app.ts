import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Express } from 'express';
import { AppModule } from './app.module';

const JWT_SECRET_PLACEHOLDER = 'troque-por-um-segredo-gerado-localmente';
const JWT_SECRET_TAMANHO_MINIMO = 32;

// Origens autorizadas a chamar a API pelo navegador. Separadas por virgula,
// com espacos tolerados ("a, b") - um espaco sobrando na variavel de ambiente
// do painel de hospedagem viraria uma origem que nunca casa, e o sintoma
// (erro de CORS no navegador, API respondendo 200 no curl) e dos mais caros
// de diagnosticar.
export function origensPermitidas(): string[] {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origem) => origem.trim())
    .filter((origem) => origem.length > 0);
}

// EXTENSAO REGISTRADA: nao especificado em nenhum artefato. Sem isso, um
// DATABASE_URL/JWT_SECRET ausente ou mal configurado so quebra no primeiro
// uso real (primeira query, primeiro login) - com erro generico e dificil de
// diagnosticar em producao. Falha rapido, na subida do processo, com
// mensagem que aponta a causa exata (mesmo espirito do achado real desta
// sessao com Usuario.fotoPerfilUrl - ver README, "Problemas reais ja
// encontrados").
function validarVariaveisDeAmbiente(): void {
  const erros: string[] = [];

  if (!process.env.DATABASE_URL) {
    erros.push('DATABASE_URL ausente - a aplicacao nao consegue conectar ao Postgres.');
  }

  // Em producao o default de desenvolvimento (http://localhost:3000) nunca e
  // a origem certa: ou o front-end tem dominio proprio e a variavel precisa
  // apontar pra ele, ou a API ficaria acessivel so por um front-end que nao
  // existe naquele ambiente. Falhar na subida evita subir uma API que responde
  // a tudo menos ao proprio portal.
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    erros.push(
      'CORS_ORIGIN ausente em producao - defina a(s) origem(ns) do portal, ex.: "https://seu-portal.vercel.app".',
    );
  }

  // Sem isto, GET /scheduler/varredura (gatilho do Vercel Cron, ver
  // scheduler.controller.ts e vercel.json) ficaria inutilizavel em producao -
  // a rota sempre rejeitaria a chamada do proprio Cron por falta de segredo
  // pra comparar, e a varredura automatica (janela de exclusividade, SLA de
  // carteira etc.) nunca rodaria em serverless.
  if (process.env.NODE_ENV === 'production' && !process.env.CRON_SECRET) {
    erros.push(
      'CRON_SECRET ausente em producao - necessario para GET /scheduler/varredura (gatilho do Vercel Cron) aceitar chamadas.',
    );
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    erros.push('JWT_SECRET ausente - login/verificacao de sessao vai falhar em runtime.');
  } else if (jwtSecret === JWT_SECRET_PLACEHOLDER) {
    erros.push('JWT_SECRET ainda esta com o valor de exemplo de .env.example - gere um segredo proprio.');
  } else if (jwtSecret.length < JWT_SECRET_TAMANHO_MINIMO) {
    erros.push(`JWT_SECRET tem menos de ${JWT_SECRET_TAMANHO_MINIMO} caracteres - fraco demais para assinar sessoes.`);
  }

  if (erros.length > 0) {
    // eslint-disable-next-line no-console
    console.error('Configuracao invalida - a aplicacao nao vai subir:\n' + erros.map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }
}

/**
 * Bootstrap compartilhado entre o processo local de sempre (main.ts,
 * app.listen numa porta) e a funcao serverless da Vercel
 * (api/index.ts, sem listen - so app.init(), a propria Vercel entrega a
 * requisicao pro Express por baixo). Tudo que nao e "escutar uma porta"
 * mora aqui, pra nao duplicar CORS/helmet/validacao entre os dois entry
 * points.
 *
 * expressInstance: quando informado (caso serverless), o Nest usa ESSA
 * instancia do Express em vez de criar uma nova - e a instancia que
 * api/index.ts repassa pra Vercel invocar a cada requisicao.
 */
export async function createApp(expressInstance?: Express): Promise<INestApplication> {
  validarVariaveisDeAmbiente();
  // rawBody:true expõe request.rawBody (Buffer) em toda requisição, ALÉM do
  // corpo já parseado como JSON normalmente (@Body()) - não muda o parsing
  // de nenhuma outra rota. Só existe porque BillingController.webhook
  // precisa do byte a byte exato recebido para verificar a assinatura HMAC
  // do Stripe (Stripe.webhooks.constructEvent) - reserializar o JSON já
  // parseado produziria bytes diferentes e a verificação falharia sempre.
  const app = expressInstance
    ? await NestFactory.create(AppModule, new ExpressAdapter(expressInstance), { rawBody: true })
    : await NestFactory.create(AppModule, { rawBody: true });

  // EXTENSAO REGISTRADA: sem isto, os hooks OnModuleDestroy (inclusive
  // PrismaService.onModuleDestroy -> $disconnect()) nunca disparam em SIGTERM/
  // SIGINT - o Nest so os chama em app.close() explicito.
  app.enableShutdownHooks();
  // EXTENSAO REGISTRADA: nao especificado em nenhum artefato - recomendacao
  // oficial do proprio guia de seguranca do NestJS
  // (https://docs.nestjs.com/security/helmet). crossOriginResourcePolicy
  // explicitamente 'cross-origin': o default do helmet ('same-origin')
  // bloquearia o proprio front-end de ler as respostas da API, ja que
  // web e api sao dominios/origens diferentes.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // CORS restritivo (ART-012): so as origens configuradas podem chamar a API.
  app.enableCors({
    origin: origensPermitidas(),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  return app;
}
