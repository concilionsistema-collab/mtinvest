import 'reflect-metadata';
// SEM 'dotenv/config' aqui de proposito: a Vercel injeta as variaveis de
// ambiente do projeto diretamente em process.env em runtime (nao existe
// arquivo .env no deploy) - carregar dotenv nao teria nada pra ler e so
// adicionaria uma dependencia desnecessaria a este entry point.
import type { IncomingMessage, ServerResponse } from 'http';
import express, { type Express } from 'express';
import { createApp } from '../src/create-app';

// Entry point serverless da Vercel (ver apps/api/vercel.json - "rewrites"
// manda TODA rota pra ca, e o Express por baixo do Nest resolve o path real
// via req.url, exatamente como resolveria num processo normal). Contraste
// com main.ts: aqui NUNCA se chama app.listen() - a Vercel e quem entrega a
// requisicao pra este handler diretamente, a cada invocacao.
//
// server/appPronto ficam em escopo de modulo (fora da funcao exportada) de
// proposito: a Vercel reaproveita a mesma instancia de funcao entre
// invocacoes "quentes" (a mesma instancia containerizada atendendo varias
// requisicoes em sequencia) - inicializar o Nest (DI container inteiro, ~20
// modulos) de novo a cada requisicao seria lento e desperdicaria a
// otimizacao que a propria Vercel oferece. So o "cold start" (primeira
// invocacao de uma instancia nova) paga o custo de bootstrap.
const server: Express = express();
let appPronto: Promise<void> | null = null;

async function inicializar(): Promise<void> {
  const app = await createApp(server);
  // app.init() (nao app.listen()): so monta os middlewares/rotas do Nest em
  // cima da instancia do Express ja criada acima - quem escuta a porta de
  // verdade e o runtime da Vercel, nao esta aplicacao.
  await app.init();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!appPronto) {
    appPronto = inicializar();
  }
  await appPronto;
  server(req, res);
}
