# Deploy do Concilion CRM na nuvem

Como o sistema sai de "roda na máquina do Raphael" para "acessível pela
internet, de qualquer máquina" — **tudo na Vercel**, portal e API.

## Arquitetura

| Peça | Onde | Como |
|---|---|---|
| Portal (`apps/web`, Next.js) | Vercel — projeto 1 | Framework Next.js nativo |
| API (`apps/api`, NestJS) | Vercel — projeto 2 | Função serverless (`apps/api/api/index.ts`) |
| Banco (Postgres) | Supabase | **Já está lá** — não muda nada |

São **dois projetos separados na Vercel**, apontando para o mesmo repositório
GitHub, cada um com seu próprio domínio (`https://algo.vercel.app`). Não dá
para juntar os dois num projeto só: a API é uma aplicação NestJS própria, não
código Next.js.

O banco **já é remoto** (Supabase). O que estava local antes era só a API e o
portal — os dados que você já tem continuam os mesmos.

### Por que a API roda como função serverless, e o que isso mudou no código

NestJS normalmente é um processo que fica sempre ligado, escutando uma porta
(é assim que roda no seu ambiente local hoje, via `apps/api/src/main.ts`). Na
Vercel não existe "processo sempre ligado": o código só roda quando chega uma
requisição HTTP, e desliga logo depois.

Isso exigiu duas mudanças reais no código (não é só configuração):

1. **`apps/api/src/create-app.ts`** — o bootstrap da aplicação (CORS, Helmet,
   validação, variáveis de ambiente) foi extraído de `main.ts` para um lugar
   compartilhado. `main.ts` (uso local) chama isso e depois `app.listen()`;
   `apps/api/api/index.ts` (Vercel) chama a mesma coisa mas **nunca chama
   `listen()`** — quem entrega a requisição pra função é a própria Vercel.

2. **O job de 5 em 5 minutos virou também uma rota HTTP.** A API tem uma
   varredura automática (`SchedulerService`, processa janela de exclusividade
   de leads, reservas expirando, SLA de carteira, vistorias, renovação de
   contrato) que antes só rodava via `@Cron` — e isso **depende de um
   processo sempre ligado**, que não existe em serverless. Agora
   `GET /scheduler/varredura` (protegida por um segredo, `CRON_SECRET`)
   dispara a mesma lógica sob demanda, e é isso que o Vercel Cron Job chama
   (configurado em `apps/api/vercel.json`).
   No plano **free** da Vercel, Cron Job só roda **1x por dia** — os prazos
   que essa varredura processa são de 48h a 180 dias, então isso é
   suficiente. Se quiser mais frequência, é plano Pro (US$20/mês).

Isso foi testado localmente (não só "parece certo no código") com um servidor
HTTP simulando exatamente como a Vercel invoca a função, antes de subir —
`/health`, `/scheduler/varredura` (com e sem segredo), CORS e uma rota
inexistente, todos respondendo como esperado.

### O proxy TLS local continua existindo, só para o ambiente local

`apps/api/scripts/postgres-tls-proxy.js` continua servindo ao ambiente local
(sua rede intercepta TLS, o Node não confia no certificado do Supabase direto
— ver comentário no próprio arquivo). Não tem relação com o deploy: a Vercel
fala com o Supabase direto, sem esse problema.

---

## Passo 1 — Connection string do Supabase

Você **não pode** usar a `DATABASE_URL` que está hoje em `apps/api/.env`
(`db.ctnturtbbxerucyhbdqa.supabase.co:5432`). Dois motivos:

1. **IPv6.** A conexão direta do Supabase resolve só em IPv6. A Vercel não
   garante saída IPv6 nas funções serverless.
2. **Modo da conexão.** `TenantPrismaService.run()` usa transação interativa
   com `set_config('app.tenant_id', ...)` para ativar a Row-Level Security
   (DEC-TEC-001). Isso **exige modo _session_**.

No painel do Supabase → **Project Settings → Database → Connection string**,
copie a do **Session pooler** (porta **5432**, host `...pooler.supabase.com`):

```
postgresql://crm_app.ctnturtbbxerucyhbdqa:SENHA@aws-0-REGIAO.pooler.supabase.com:5432/postgres?schema=public
```

> ⚠️ **Não use o Transaction pooler (porta 6543).** Ele não preserva estado
> entre comandos da mesma transação — a RLS multi-tenant quebraria de forma
> silenciosa e perigosa: consultas passariam a enxergar dados de outro tenant.
> Porta **5432**, sempre.

O usuário é **`crm_app`**, não `postgres` — a aplicação nunca deve conectar
como superusuário (superusuário ignora RLS, anularia o isolamento entre
tenants). No pooler o usuário leva o ref do projeto como sufixo:
`crm_app.ctnturtbbxerucyhbdqa`.

## Passo 2 — Gerar segredos de produção

Dois segredos novos, específicos de produção (nunca reaproveitar os de
desenvolvimento):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Rode duas vezes: um valor vira **`JWT_SECRET`**, outro vira **`CRON_SECRET`**.
Trocar o `JWT_SECRET` invalida todas as sessões existentes (todo mundo faz
login de novo) — como o ambiente é novo, não custa nada agora.

## Passo 3 — Projeto da API na Vercel

1. **https://vercel.com** → login com GitHub (conta `concilionsistema-collab`)
2. **Add New → Project** → importe `concilionsistema-collab/mtinvest`
3. Em **Root Directory**, clique em "Edit" e selecione **`apps/api`** — é
   isso que faz a Vercel usar `apps/api/vercel.json` (build, rewrites, cron)
   em vez do `vercel.json` do portal.
4. Em **Framework Preset**, deixe como "Other" (não é Next.js).
5. Variáveis de ambiente (**Settings → Environment Variables**):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a string do **Session pooler** do Passo 1 |
| `JWT_SECRET` | o primeiro segredo do Passo 2 |
| `CRON_SECRET` | o segundo segredo do Passo 2 |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | por enquanto `http://localhost:3000` — ajustamos no Passo 5 |

6. Deploy. Ao terminar, anote o domínio gerado, ex.
   `https://mtinvest-api.vercel.app`.
7. Confirme que subiu:

```bash
curl https://mtinvest-api.vercel.app/health
# esperado: {"status":"ok","database":"ok","timestamp":"..."}
```

`"database":"ok"` é o que prova que a `DATABASE_URL` do Passo 1 está certa.

**Não precisa rodar migrations no deploy.** O banco do Supabase já está
migrado — é o mesmo que você usa hoje.

## Passo 4 — Projeto do portal na Vercel

1. **Add New → Project** novamente → mesmo repositório `mtinvest`
2. Em **Root Directory**, deixe o **padrão** (raiz do repositório) — é isso
   que faz a Vercel usar o `vercel.json` da raiz (Next.js, build do portal).
3. Variável de ambiente:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | a URL do Passo 3 (`https://mtinvest-api.vercel.app`, **sem barra no final**) |

4. Deploy. Anote o domínio gerado, ex. `https://mtinvest.vercel.app`.

> `NEXT_PUBLIC_*` é embutida no bundle em tempo de **build**. Mudar essa
> variável depois exige um novo deploy — reiniciar não adianta.

## Passo 5 — Fechar o CORS (não pule)

Volte ao projeto da **API** na Vercel → **Settings → Environment Variables**
→ edite `CORS_ORIGIN`:

```
CORS_ORIGIN = https://mtinvest.vercel.app
```

Sem barra no final, exatamente o domínio do Passo 4. Salvar já dispara um
novo deploy automaticamente. A API se recusa a subir em produção sem essa
variável (ver `create-app.ts`), justamente para essa etapa não ser esquecida.

Se for usar previews da Vercel para o portal, inclua o domínio de preview
separado por vírgula.

## Passo 6 — Validar ponta a ponta

1. Abra o domínio do portal em uma máquina **que não seja a sua**
2. Faça login
3. Navegue por leads / imóveis / locação

Se a tela de login carrega mas o login falha, abra o console do navegador:
- **Erro de CORS** → `CORS_ORIGIN` não bate exatamente com o domínio (Passo 5)
- **Failed to fetch / 500** → `DATABASE_URL` errada, ou faltou alguma env var

Para confirmar que o Cron Job está de fato configurado: Vercel → projeto da
API → aba **Cron Jobs** deve listar `/scheduler/varredura`, 1x/dia.

---

## Limitações conhecidas deste setup

### Varredura automática roda 1x/dia, não a cada 5 minutos

No plano free, é a frequência máxima do Vercel Cron. Como os prazos
processados são de 48h a 180 dias (ver comentário em
`scheduler.service.ts`), isso não compromete a regra de negócio — só significa
que, no pior caso, uma janela vencida é processada até 24h depois de vencer
em vez de 5 minutos depois. Se isso deixar de ser aceitável, o plano Pro
permite frequência maior sem mudar nenhum código.

### Cold start nas primeiras requisições após período ocioso

Funções serverless "dormem" entre invocações e levam ~1-3s para "acordar" na
primeira requisição depois de um tempo sem tráfego — bem mais rápido que a
hibernação de 30-50s que teríamos num serviço de container gratuito, mas
ainda perceptível. Requisições seguintes ficam rápidas enquanto a função
continua "quente".

### Foto de perfil

Já corrigido (2026-08-11): a foto fica no Postgres (colunas `foto_perfil` /
`foto_perfil_tipo` em `Usuario`), servida por uma rota autenticada, buscada
pelo portal via `apiFetchBlob` (não uma `<img src>` direta, que não enviaria
o header `Authorization`). Funciona igual em qualquer plano/hospedagem.

### Migrations continuam manuais

Rodar migration nova em produção segue sendo um comando local apontando
`MIGRATE_DATABASE_URL` para o Supabase (ver README, seção de bootstrap).
Automatizar isso no pipeline é uma decisão em aberto.

## Ambiente local continua funcionando

Nada aqui muda o fluxo local. `Iniciar Concilion CRM.cmd` segue subindo o
proxy TLS, a API (via `main.ts`, processo tradicional) e o portal em
`localhost` contra o mesmo banco Supabase — o entry point serverless
(`apps/api/api/index.ts`) só é usado pela Vercel.

Atenção: local e produção compartilham o **mesmo banco**. Mexer em dados na
sua máquina mexe nos dados de quem está usando o sistema online.
