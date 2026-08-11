import 'dotenv/config';
import 'reflect-metadata';
import { createApp, origensPermitidas } from './create-app';

// Entry point do processo local (dev via 'nest start --watch', e de
// qualquer hospedagem tradicional que rode 'node dist/main.js' num
// processo sempre ligado). Em producao na Vercel, quem sobe a aplicacao e
// api/index.ts (serverless, sem listen) - ver esse arquivo e
// create-app.ts para o que e compartilhado entre os dois.
async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  // '0.0.0.0' explicito: qualquer hospedagem tradicional em container so
  // consegue rotear trafego pro processo se ele escutar em todas as
  // interfaces. O default do Node ja e esse, mas deixar implicito significa
  // que qualquer mudanca futura pra '127.0.0.1' (comum em exemplos de dev)
  // derrubaria o deploy com um health check falhando sem explicacao.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API ouvindo na porta ${port}. Origens CORS: ${origensPermitidas().join(', ')}`);
}

bootstrap();
