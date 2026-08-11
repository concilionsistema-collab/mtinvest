# Deploy do Concilion CRM na nuvem

Como o sistema sai de "roda na máquina do Raphael" para "acessível pela
internet, de qualquer máquina".

## Arquitetura

| Peça | Onde | Porquê |
|---|---|---|
| Portal (`apps/web`, Next.js) | Vercel | Plano free, feito para Next.js |
| API (`apps/api`, NestJS) | Render | Processo de longa duração, mantém a pool do Postgres |
| Banco (Postgres) | Supabase | **Já está lá** — não muda nada |

O banco **já é remoto**. O que estava local era só a API e o portal. Isso
significa que os dados que você já tem continuam os mesmos depois do deploy —
não há migração de dados envolvida.

### O proxy TLS local deixa de existir na nuvem

Hoje a API local não fala direto com o Supabase: passa por
`apps/api/scripts/postgres-tls-proxy.js`, que o supervisor sobe na porta 15432.
Ele existe porque a rede local intercepta TLS e o Node não confia no
certificado do Supabase — o mesmo motivo pelo qual o `winget` falhou ao buscar
na fonte `msstore` durante esta configuração.

Na nuvem esse problema não existe: o Render fala com o Supabase direto, com o
CA público normal. O proxy e o supervisor continuam servindo ao ambiente local
e **não devem ser usados no deploy**.

---

## Passo 1 — Connection string do Supabase (o passo que mais dá errado)

Você **não pode** usar a `DATABASE_URL` que está hoje em `apps/api/.env`
(`db.ctnturtbbxerucyhbdqa.supabase.co:5432`). Dois motivos:

1. **IPv6.** A conexão direta do Supabase resolve só em IPv6. O Render não tem
   saída IPv6 no plano free — a API subiria e falharia em toda query.
2. **Modo da conexão.** `TenantPrismaService.run()` usa transação interativa com
   `set_config('app.tenant_id', ...)` para ativar a Row-Level Security
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

Detalhes:
- O usuário é **`crm_app`**, não `postgres`. A aplicação nunca deve conectar
  como superusuário: donos/superusuários **ignoram RLS**, o que anularia todo o
  isolamento entre tenants (ver `db/init/001_create_app_role.sql`).
- No pooler o usuário leva o ref do projeto como sufixo: `crm_app.ctnturtbbxerucyhbdqa`.
- A senha é a mesma que está hoje no `.env` local, para o usuário `crm_app`.

## Passo 2 — Gerar um JWT_SECRET de produção

O segredo atual foi gerado para desenvolvimento e já circulou em máquina local.
Produção merece um novo — com ele, qualquer pessoa forja um token de sessão de
qualquer usuário de qualquer tenant:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Trocar o segredo **invalida todas as sessões existentes** — todo mundo faz
login de novo. Como o ambiente é novo, isso não custa nada agora.

## Passo 3 — Deploy da API no Render

1. https://render.com → login com GitHub → **New → Blueprint**
2. Selecione o repositório. O Render lê o [`render.yaml`](render.yaml) e propõe
   o serviço `concilion-crm-api` já configurado (build, start, health check).
3. Ele vai pedir as três variáveis marcadas como `sync: false`:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a string do **Session pooler** do Passo 1 |
| `JWT_SECRET` | o segredo gerado no Passo 2 |
| `CORS_ORIGIN` | deixe `http://localhost:3000` por enquanto — corrigimos no Passo 5 |

4. Deploy. O primeiro build leva ~5 min.
5. Confirme que subiu:

```bash
curl https://concilion-crm-api.onrender.com/health
# esperado: {"status":"ok","database":"ok","timestamp":"..."}
```

`"database":"ok"` é o que prova que a connection string do Passo 1 está certa.
Se vier `503`, o problema é a `DATABASE_URL` — não o deploy.

**Não rode migrations no deploy.** O banco do Supabase já está migrado; é o
mesmo que você usa hoje. `render.yaml` não roda `prisma migrate deploy` de
propósito.

## Passo 4 — Deploy do portal na Vercel

1. https://vercel.com → login com GitHub → **Add New → Project** → importe o repositório
2. A Vercel lê o [`vercel.json`](vercel.json) (build do workspace + Next.js). Não
   mude o Root Directory — o build precisa rodar da raiz para resolver `@crm/shared`.
3. Adicione a variável de ambiente:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://concilion-crm-api.onrender.com` (a URL do Passo 3, **sem barra no final**) |

4. Deploy. Anote o domínio gerado, ex. `https://concilion-crm.vercel.app`.

> `NEXT_PUBLIC_*` é embutida no bundle em tempo de **build**. Se você mudar
> essa variável depois, precisa **refazer o deploy** — reiniciar não adianta.

## Passo 5 — Fechar o CORS (não pule)

Volte ao Render → serviço → **Environment** → ajuste:

```
CORS_ORIGIN = https://concilion-crm.vercel.app
```

Sem barra no final, exatamente o domínio da Vercel. Salve — o Render reinicia
sozinho. A API se recusa a subir em produção sem essa variável (ver
[`main.ts`](apps/api/src/main.ts)), justamente para essa etapa não ser esquecida.

Se você usa previews da Vercel, inclua o domínio de preview separado por
vírgula. Espaços após a vírgula são tolerados.

## Passo 6 — Validar ponta a ponta

1. Abra o domínio da Vercel em uma máquina **que não seja a sua**
2. Faça login
3. Navegue por leads / imóveis / locação

Se a tela de login carrega mas o login falha, abra o console do navegador:
- **Erro de CORS** → `CORS_ORIGIN` não bate exatamente com o domínio (Passo 5)
- **Failed to fetch / 503** → API hibernando (veja abaixo) ou `DATABASE_URL` errada

---

## Limitações conhecidas deste setup

### A API hiberna (plano free do Render)

Após 15 min sem tráfego o serviço dorme. A requisição seguinte demora **30 a
50 segundos** — para o usuário, parece que o sistema travou no login.

Para uso real por corretores no dia a dia, o plano **Starter (US$ 7/mês)**
elimina isso. É a única mudança necessária: nada no código muda.

Não resolva isso com um pinger externo de 5 em 5 minutos — além de violar os
termos do plano free, consome as horas gratuitas do mês.

### Foto de perfil não persiste (e hoje já não funciona)

`POST /usuarios/:id/foto` grava em disco local
([`usuarios.controller.ts:81`](apps/api/src/modules/usuarios/usuarios.controller.ts#L81)).
O disco do Render é efêmero: some a cada deploy.

Isso **não é uma regressão do deploy** — o recurso já está quebrado localmente.
O portal pede a imagem com `<img src>`, que não envia o header `Authorization`,
então o `JwtAuthGuard` global responde 401 e a tela sempre cai no fallback de
iniciais. Consertar de verdade significa guardar a imagem no Postgres (ou no
Supabase Storage) e servi-la por uma rota autenticada. Trabalho separado, ainda
não feito.

### Migrations continuam manuais

Rodar migration nova em produção segue sendo um comando local apontando
`MIGRATE_DATABASE_URL` para o Supabase. Automatizar isso no pipeline é uma
decisão em aberto (o CI hoje nem conecta em banco real, de propósito — ver
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Ambiente local continua funcionando

Nada aqui muda o fluxo local. `Iniciar Concilion CRM.cmd` segue subindo o
proxy TLS, a API e o portal em `localhost` contra o mesmo banco Supabase.

Atenção: local e produção compartilham o **mesmo banco**. Mexer em dados na sua
máquina mexe nos dados de quem está usando o sistema online.
