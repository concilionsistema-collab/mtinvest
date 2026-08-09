import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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
function validarVariaveisDeAmbiente(): void {
  const erros: string[] = [];

  if (!process.env.DATABASE_URL) {
    erros.push('DATABASE_URL ausente - a aplicacao nao consegue conectar ao Postgres.');
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
  // CORS restritivo (ART-012): so a origem do front-end local pode chamar a API.
  // TODO(prod): trocar por lista de origens vinda de configuracao antes do deploy real.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
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
  await app.listen(port);
}

bootstrap();
