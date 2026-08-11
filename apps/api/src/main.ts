import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

const JWT_SECRET_PLACEHOLDER = 'troque-por-um-segredo-gerado-localmente';
const JWT_SECRET_TAMANHO_MINIMO = 32;

// EXTENSAO REGISTRADA: nao especificado em nenhum artefato. Sem isso, um
// DATABASE_URL/JWT_SECRET ausente ou mal configurado so quebra no primeiro
// uso real (primeira query, primeiro login) - com erro generico e dificil de
// diagnosticar em producao. Falha rapido, na subida do processo, com
// mensagem que aponta a causa exata (mesmo espirito do achado real desta
// sessao com Usuario.fotoPerfilUrl - ver README, "Problemas reais ja
// encontrados").
// Origens autorizadas a chamar a API pelo navegador. Separadas por virgula,
// com espacos tolerados ("a, b") - um espaco sobrando na variavel de ambiente
// do painel de hospedagem viraria uma origem que nunca casa, e o sintoma
// (erro de CORS no navegador, API respondendo 200 no curl) e dos mais caros
// de diagnosticar.
function origensPermitidas(): string[] {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origem) => origem.trim())
    .filter((origem) => origem.length > 0);
}

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

async function bootstrap(): Promise<void> {
  validarVariaveisDeAmbiente();
  const app = await NestFactory.create(AppModule);
  // EXTENSAO REGISTRADA: sem isto, os hooks OnModuleDestroy (inclusive
  // PrismaService.onModuleDestroy -> $disconnect()) nunca disparam em SIGTERM/
  // SIGINT - o Nest so os chama em app.close() explicito. Qualquer plataforma
  // de hospedagem real (container, orquestrador) manda SIGTERM pra pedir
  // desligamento gracioso antes de matar o processo; sem isto o processo
  // morre imediatamente, sem drenar requisicoes em andamento nem fechar a
  // pool de conexoes do Postgres.
  app.enableShutdownHooks();
  // EXTENSAO REGISTRADA: nao especificado em nenhum artefato - recomendacao
  // oficial do proprio guia de seguranca do NestJS
  // (https://docs.nestjs.com/security/helmet). Cabecalhos HTTP de seguranca
  // basicos (X-Content-Type-Options, Strict-Transport-Security etc.).
  // crossOriginResourcePolicy explicitamente 'cross-origin': o default do
  // helmet ('same-origin') bloquearia o proprio front-end de ler as
  // respostas da API, ja que web (porta 3000) e api (porta 3001) sao
  // origens diferentes - CORP e um header de protecao de recurso, aplicado
  // pelo navegador independente do CORS ja configurado abaixo.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // CORS restritivo (ART-012): so as origens configuradas podem chamar a API.
  // Em producao a lista vem obrigatoriamente de CORS_ORIGIN (validada na
  // subida, ver validarVariaveisDeAmbiente) - o default de localhost so vale
  // em desenvolvimento. Aceita varias origens separadas por virgula, ex.:
  // "https://crm.vercel.app,https://crm-preview.vercel.app".
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
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  // '0.0.0.0' explicito: plataformas de hospedagem em container (Render, Fly,
  // Railway) so conseguem rotear trafego pro processo se ele escutar em todas
  // as interfaces. O default do Node ja e esse, mas deixar implicito significa
  // que qualquer mudanca futura pra '127.0.0.1' (comum em exemplos de dev)
  // derrubaria o deploy com um health check falhando sem explicacao.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API ouvindo na porta ${port}. Origens CORS: ${origensPermitidas().join(', ')}`);
}

bootstrap();
