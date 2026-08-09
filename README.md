# CRM Imobiliário — Sistema

Implementação em código do que está especificado em `../crm-imobiliario-projeto/`. Este diretório é o início da fase de **construção**; a especificação (regras, decisões, backlog) continua vivendo em `../crm-imobiliario-projeto/artefatos/` e `../crm-imobiliario-projeto/decisoes/` — não duplique regra de negócio aqui, só implemente o que já está lá.

Stack adotada: ver [`../crm-imobiliario-projeto/decisoes/DEC-TEC-002-stack-tecnologica.md`](../crm-imobiliario-projeto/decisoes/DEC-TEC-002-stack-tecnologica.md).

## Estrutura

```
sistema/
├── apps/
│   ├── api/     # NestJS + Prisma + PostgreSQL (RLS por tenant)
│   └── web/     # Next.js + React + TypeScript
├── packages/
│   └── shared/  # Tipos TypeScript compartilhados, espelham ART-005
├── db/init/     # Bootstrap de Postgres local via Docker (cria o role de aplicação sem BYPASSRLS)
└── docker-compose.yml
```

## Banco de dados em uso

Ambiente de desenvolvimento atual roda contra um projeto **Supabase** (Postgres gerenciado), não contra o `docker-compose.yml` local — foi o caminho mais rápido para não depender de instalar Docker/WSL na máquina de desenvolvimento. O `docker-compose.yml` continua disponível para quem preferir rodar 100% local.

**Descoberta importante:** o Supabase habilita Row-Level Security automaticamente (`relrowsecurity = true`) em toda tabela nova do schema `public`, mas sem nenhuma política — o que bloqueia (default-deny) todo acesso do role de aplicação até uma política ser criada. Por isso, **toda migration que cria uma tabela tenant-scoped nova precisa vir acompanhada de uma migration de política RLS** (ver `prisma/migrations/20260801185500_rls_imovel/migration.sql` como modelo). Isso não é opcional nem cosmético: sem a política, a tabela fica inutilizável pelo `crm_app`, não insegura.

## O que já está implementado

**EPIC-01 — Identidade e fundação (parcial):**
- **US-001** — cadastrar unidade dentro do tenant, com alerta de possível duplicidade (CA-001/CA-002).
- **US-002** — conceder perfil (`POST /usuarios`, `AuthModule`/`UsuariosService`): só dentro da própria unidade do concedente (CA-001), e conceder o perfil crítico `GESTOR_UNIDADE` exige que o concedente já seja `GESTOR_UNIDADE` (CA-002). Toda concessão gera `RegistroDeAuditoria` (acao `PERFIL_CONCEDIDO`). **Simplificação maior registrada**: ART-006 define 16 perfis com matriz completa de alçada; este sistema só implementa 2 (`GESTOR_UNIDADE`/`CORRETOR`) — ver comentário em `schema.prisma`, enum `UsuarioPerfil`. Sem `AtribuicaoDePerfil` como entidade própria.
- **US-003** — login real com e-mail/senha (`POST /auth/login`, JWT) e bloqueio automático de usuário desligado: o `JwtAuthGuard` reconsulta `Usuario.status` a cada requisição (sem sessão com estado/blacklist neste MVP) — usuário `DESLIGADO` perde acesso na próxima chamada e não consegue mais logar. Bloqueio gera `RegistroDeAuditoria` (acao `USUARIO_DESLIGADO`).

**EPIC-02 — Imóveis (completo):**
- **US-004** — captar imóvel, com unidade proprietária persistente (RN-005, ART-004).
- **US-005** — compartilhar/revogar compartilhamento de imóvel entre unidades, com histórico auditado.
- **US-006** — coproprietários de imóvel com percentuais vigentes, versionados por vigência (composição antiga nunca é apagada, só "fechada").

**EPIC-03 — Leads (completo):**
- **US-007** — captura de lead com deduplicação por telefone/documento normalizado (RN-003, ART-004). **CA-002 (atomicidade sob concorrência) fechada**: constraint única real no banco (`Pessoa(tenantId, documentoNormalizado)` / `Pessoa(tenantId, telefoneNormalizado)`, NULL tratado como distinto pelo Postgres — pessoas sem os dois campos continuam coexistindo) + retry automático em `LeadsService.capturar` quando a colisão acontece (a transação "perdedora" recebe `P2002`, já foi abortada pelo Postgres, então a operação inteira é refeita uma vez — da segunda vez já enxerga a `Pessoa` da vencedora). Testado disparando 5 capturas verdadeiramente simultâneas (`Promise.all`) com o mesmo telefone contra o banco real: todas retornaram 201 sem erro, convergiram no mesmo lead, e só 1 `Pessoa`/`Lead` foi criado.
- **US-008** — distribuição automática round-robin + janela de exclusividade de 48h, com reabertura automática ao vencer. Duplo gatilho: checagem "preguiçosa" embutida (roda a cada listagem/captura, consistência imediata) **e** `SchedulerService` real (ver "Transversal" abaixo, cron a cada 5 min) — o mesmo método cobre os dois caminhos.
- **US-009** — reativação automática de lead INATIVO ao recontatar (marcação de inatividade também com duplo gatilho preguiçoso+agendado; prazo de 180 dias como hipótese até DEC-NEG-011 ser aprovada).
- **US-010** — desligar corretor libera e redistribui automaticamente os leads sem negociação avançada (CA-001). **CA-002 implementada** (`sistema/apps/api/src/modules/carteiras/`): lead com `Oportunidade` em estágio avançado (`VISITA_CONFIRMADA`/`PROPOSTA_ENVIADA`/`EM_CONTRAPROPOSTA`/`RESERVA`/`DOCUMENTACAO_CONCLUIDA` — a última é extensão registrada além do texto literal de RN-009) não é redistribuído: entra em `TransferenciaDeCarteira` `PENDENTE`, e só o Gestor de unidade decide o destino (`POST /carteiras/transferencias/:id/decidir`). SLA de 5 dias corridos (hipótese, DEC-NEG-005 pendente); vencido, escala para `ESCALADA_MATRIZ` (duplo gatilho preguiçoso+agendado) mas fica sem ação possível via API — perfil "matriz" não existe nesta fatia (default-deny documentado, mesmo padrão de US-024).

**EPIC-04 — Funil de oportunidades (parcial):**
- **US-011** — Kanban com 9 colunas (estados de ART-009 §8.1), transição de estágio validada no backend contra o mapa de transições válidas, não só na UI.
- **US-012** — criar oportunidade vinculando lead a imóvel, com bloqueio de duplicidade e de criação por quem não é o responsável do lead.
- **US-013** — registrar tentativa de contato; mínimo de 3 tentativas (hipótese) exigido antes de mover para "Perdida" — ver interpretação registrada em `ART-014`.

**EPIC-05 — Agenda e visitas (completo):**
- **US-014** — agendar/confirmar visita sincroniza automaticamente o estágio da Oportunidade (mesma transação). Alerta de confirmação pendente (CA-002) é um campo calculado (`precisaAlerta`), não uma notificação real.
- **US-015** — registrar resultado da visita; "não compareceu" comprovadamente não avança a oportunidade sozinho.

**EPIC-06 — Proposta, contraproposta e reserva (completo):**
- **US-016** — registrar proposta formal, sincroniza a Oportunidade para PROPOSTA_ENVIADA.
- **US-017** — contraproposta valida desconto contra `Imovel.valorAnunciado`/`percentualDescontoPreAutorizado` (campos novos); fora da faixa exige `aprovadorUsuarioId`. Permite mais de uma rodada de negociação (extensão registrada em `ART-014`).
- **US-018** — reserva só a partir de proposta aceita; bloqueio de imóvel já reservado por outra oportunidade (RN-307) testado; expiração automática (5 dias, hipótese) marca a Reserva como EXPIRADA sem forçar a Oportunidade a retroceder.

**EPIC-07 — Documentação e fechamento (completo):**
- **US-019** — checklist documental por oportunidade (`ChecklistDocumentoItem`); itens padrão gerados de forma "preguiçosa" (na primeira consulta) a partir de `Imovel.finalidade` — lista de documentos é hipótese de trabalho, não validada juridicamente. Bloqueia a transição RESERVA → DOCUMENTACAO_CONCLUIDA enquanto houver item obrigatório pendente (CA-001, RN-308); esta transição é tratada como o "gerar contrato" do critério de aceite, já que não existe um passo de assinatura eletrônica separado neste MVP. Cada item marcado gera `RegistroDeAuditoria` (acao `CHECKLIST_ITEM_ALTERADO`, ator vindo de `CurrentUsuario()`).
- **US-020** — fechar oportunidade (`OportunidadesService.fechar`), só a partir de DOCUMENTACAO_CONCLUIDA e só pelo responsável pelo lead. Se o imóvel pertence a unidade diferente da unidade do lead, registra `ComissaoCruzadaAcionada` (RN-309) — **apenas o gatilho/registro do evento, não um cálculo de valor de comissão**, pois a tabela-padrão de comissionamento depende de DEC-NEG-002 (ainda não aprovada). Fechamento gera `RegistroDeAuditoria` (acao `OPORTUNIDADE_FECHADA`).

**EPIC-08 — WhatsApp:** adiado (2026-08-01) — depende de `DEC-TEC-006` (fornecedor/BSP), decisão comercial ainda pendente, fora do escopo técnico. Retomar quando um fornecedor for escolhido.

**EPIC-09 — Busca e radar (completo):**
- **US-022** — radar de sugestões lead-imóvel (`RadarService`). Nunca cria `Oportunidade` sozinho (RN-316) — só computa a lista sob demanda e registra a decisão humana (`SugestaoRadar` + `RegistroDeAuditoria`, acao `SUGESTAO_RADAR_DECIDIDA`) quando o corretor aceita/recusa; criar a oportunidade continua exigindo um clique explícito. Critério de compatibilidade é uma **extensão registrada**: RN-316 não define o algoritmo e `ART-005` nuclear não tem campos de preferência em `Lead` — adicionei `finalidadeDesejada`/`orcamentoMinimo`/`orcamentoMaximo` (opcionais) e o match só filtra por um critério quando ambos os lados (lead e imóvel) têm o dado.

**EPIC-11 — Indicadores básicos (completo):**
- **US-024** — painel de indicadores (`IndicadoresService`, tela "Indicadores"): funil de oportunidades por estágio, leads por estado, visitas realizadas, propostas enviadas, fechamentos e SLA, sempre por agregação (nunca expõe lead/pessoa individual, RN-011). SLA é uma **aproximação documentada**, não uma medição exata contra o prazo original — o sistema não guarda histórico de mudanças da janela de exclusividade. **Restrição de acesso por perfil implementada**: só `GESTOR_UNIDADE` acessa (`CORRETOR` recebe 403), sempre escopado à própria unidade — a visão "consolidado" (gestor da matriz) fica bloqueada por padrão para todo mundo, já que esse perfil não existe nesta fatia (postura default-deny, não uma funcionalidade faltando).

**Transversal:**
- **Polimento de consistência de UI (2026-08-02)**: sem acesso a navegador/screenshot nesta sessão, a rodada de "design de verdade" ficou restrita a melhorias defensáveis por código, não julgamento visual (decisão explícita do usuário) — validadas por build e checagem de rotas, não visualmente. Adicionado globalmente em `globals.css`: estado de foco visível por teclado (`:focus-visible`, WCAG 2.4.7 — antes inexistente em toda a aplicação), hover/active/disabled para todo `button`, hover/focus para `input`/`select`/`textarea`, hover para links do menu lateral — tudo via regra genérica por elemento/pseudo-classe, sem precisar tocar cada tela. Token `--text-xs` (fluido, mesmo padrão `clamp()` dos demais) substituiu ~17 ocorrências de `fontSize: '0.75rem'` hardcoded espalhadas em painéis auxiliares (checklist, proposta, radar, visitas). Todo `<input>`/`<select>` sem `<label>` associado (30+ campos) ganhou `aria-label` (WCAG 1.3.1/4.1.2) — a tela de login já usava `<label>` envolvendo o campo, mantida como estava. Hierarquia de heading (`h1`=`--text-xl`, `h2`=`--text-lg`) e uso de cores (só via variáveis de `globals.css`, nenhuma cor hardcoded fora dali) já estavam consistentes, conferido antes de mexer. Ainda pendente: uma revisão visual de verdade (espaçamento, densidade, hierarquia) exige alguém olhando no navegador — não é algo que dá pra fechar só por código.
- Row-Level Security por tenant no PostgreSQL para todas as tabelas tenant-scoped, conforme `DEC-TEC-001` — inclui a descoberta de que o Supabase liga RLS automaticamente sem política (ver seção acima). **Provado por teste de integração real** (`apps/api/src/common/tenant/tenant-isolation.integration-spec.ts`, `npm run test:integration --workspace=apps/api`, não mockado — toca o Postgres de verdade): dois tenants reais, consulta sem `where` de tenant nunca vaza linha de outro tenant, consulta sem `app.tenant_id` setado falha fechado (zero linhas, nunca "todas"), e a garantia é verificada também via SQL bruto (`$queryRaw`), não só o query builder do Prisma. Fechou a pendência que antes só era verificada manualmente a cada rodada.
- **Suíte e2e real (2026-08-02)**: até esta rodada, a suíte quase toda era teste de service com Prisma mockado (rápido, mas não prova que `ValidationPipe`, `JwtAuthGuard` e o roteamento real de cada módulo estão de fato ligados). Nova suíte separada (`apps/api/src/**/*.e2e-spec.ts`, `jest.e2e.config.js`, `npm run test:e2e --workspace=apps/api`) sobe a aplicação Nest inteira (`Test.createTestingModule` + `supertest`, mesmos pipes globais de `main.ts`) contra o mesmo Postgres real da suíte de integração. `auth.e2e-spec.ts`: `ValidationPipe` rejeitando corpo malformado/campo não whitelisted antes do controller, `JwtAuthGuard` bloqueando requisição sem token e com assinatura inválida, e o fluxo completo de refresh/rotação/reuso-rejeitado/logout (ver "Fechada: refresh token real" acima) por HTTP de ponta a ponta. `unidades.e2e-spec.ts`: isolamento por tenant através da pilha inteira (token JWT real → guard → controller → service → RLS), complementando `tenant-isolation.integration-spec.ts` (que prova a mesma garantia só a nível de Prisma/SQL, sem HTTP). **Achado real durante a escrita destes testes, não só cobertura nova**: a assinatura JWT é determinística (HMAC) — duas chamadas de `refresh()` para o mesmo usuário no mesmo segundo podiam gerar o texto do token idêntico (mesmas claims + mesmo `iat`), o que quebraria a detecção de reuso do refresh token (hash igual entre a linha revogada e a nova linha ativa). Corrigido adicionando `jti` (JWT ID, `crypto.randomUUID()`) a todo token emitido — garante unicidade sempre, prática padrão de JWT.
- Casca do aplicativo (`components/app-shell.tsx`): menu lateral + cabeçalho, reflow responsivo (`SKILL_engenheiro_telas.md`), reaproveitada por toda tela nova. Agora também é o portão de autenticação: redireciona para `/login` sem sessão válida.
- Autenticação real (US-002/US-003): `JwtAuthGuard` global (`common/auth/`) substitui o antigo `TenantMiddleware`/header `x-tenant-id` — todo endpoint (exceto `POST /auth/login`, marcado `@Public()`) exige `Authorization: Bearer <jwt>`, e o tenant/usuário/perfil vêm do token verificado, nunca de um valor enviado pelo cliente. `components/auth-context.tsx` (front-end) guarda o token e decodifica as claims públicas para a UI.
- Trilha de auditoria (`RegistroDeAuditoria`, `sistema/apps/api/src/modules/auditoria/`): append-only (só `create`/`findMany`, nunca `update`/`delete`), consultável em `GET /auditoria` (tela "Auditoria", restrita a `GESTOR_UNIDADE`) e reaproveitada via `AuditoriaService.registrarTx` dentro da mesma transação de quem audita. **Cobertura completa dos itens obrigatórios de ART-005 §9 que existem nesta fatia**: `Imovel.estadoCompartilhamento` (US-005) e `Lead.estado` — **atualizado**: `atorUsuarioId` agora é opcional (`string | null`), NULL representa **ator sistema** (evento automático agendado, sem usuário humano por trás — ver `SchedulerService` abaixo), fechando a lacuna antes registrada aqui ("sem conceito de ator sistema nesta fatia"). Distribuição automática em `capturar()`, reabertura por SLA vencido, marcação de inatividade, expiração de reserva e escalonamento de carteira **agora são todas auditadas** (com ator sistema); quando há ator humano real, continua atribuída a ele normalmente. `TransferenciaDeCarteira` (US-010, CA-002) também é auditada, com ator humano (decisão do gestor) ou sistema (escalonamento por SLA). `AcessoDetalhadoMatriz` (o último item de §9) não existe como entidade nesta fatia. Além disso, `Oportunidade.estado` é auditado por inteiro através do chokepoint único `OportunidadesService.moverEstagioTx`. Mais: concessão de perfil (US-002), desligamento de usuário (US-003), criação de oportunidade (US-012), item de checklist concluído (US-019) e decisão do radar (US-022).
- **`SchedulerService`** (`sistema/apps/api/src/modules/scheduler/`, `@nestjs/schedule`): job real (cron a cada 5 min, `CronExpression.EVERY_5_MINUTES`) que substitui os agendadores "preguiçosos" (README, "Próximos passos sugeridos" anterior) — varre todos os tenants `ATIVO` e roda, dentro do contexto RLS de cada um (`TenantPrismaService.run`), a mesma lógica de negócio já usada pela checagem embutida em cada request (reabertura de lead por SLA, marcação de inatividade, expiração de reserva, escalonamento de transferência de carteira, confirmação automática de vistoria de saída sem contestação dentro do prazo desde US-107, e encerramento automático de contrato de locação vencido sem renovação desde US-109/110) — os dois gatilhos reaproveitam o mesmo método (`executarVarreduraAutomaticaTx` em cada service), nunca duplicam regra. Falha num tenant não trava os demais (try/catch por tenant, logado). Para enumerar tenants, o role da aplicação (`crm_app`) ganhou uma política de leitura em `tenant` (só `SELECT`, nunca escrita — ver migration `rls_tenant_leitura_app`), já que nenhum outro caminho de código precisava disso antes. Testado ponta a ponta contra o banco real: varredura manual processou lead com SLA vencido (reabriu e redistribuiu), reserva vencida (expirou) e transferência de carteira vencida (escalou), cada uma com `RegistroDeAuditoria` de ator sistema.

- **Redesenho visual e reconciliação do menu lateral (2026-08-02)**: `globals.css`, `app-shell.tsx` e `app/page.tsx` (dashboard) foram substituídos por um novo tema visual (dark, estilo SaaS) com um menu de 14 itens — a troca trouxe um dashboard inicial (`/`) totalmente mockado (dados fixos, sem chamada real à API) e um menu com mais entradas do que telas reais existiam (7 telas reais para 14 itens de menu, com duplicação/rotas mal mapeadas). Reconciliado construindo as seções que faltavam como telas reais (não mocks): `/funil` (funil de 5 etapas, reaproveita `GET /indicadores`), `/marketing` (leads por canal — novo campo `leadsPorCanal` em `IndicadoresService.obter`), `/financeiro` (VGV fechado + contagem de comissão cruzada acionada — novos campos `vgvFechado`/`comissoesCruzadasQuantidade`, mesmo serviço), `/propostas` e `/contratos` (visão cruzada por unidade, fora do escopo de uma oportunidade específica — novos métodos `listarTodas` em `PropostasService`/`VisitasService`, endpoints `GET /propostas` e `GET /visitas` sem `oportunidadeId`), `/relatorios` (hub simples linkando as telas acima).
- **Fechada (2026-08-05)**: `app/page.tsx` (dashboard) deixou de ser mockado. Os 6 cards de métrica (Leads Totais, Negociações Ativas, Imóveis em Carteira, Visitas Agendadas, Vendas Fechadas, VGV Este Mês) agora buscam `/leads`, `/oportunidades`, `/imoveis`, `/visitas` (não `/indicadores`, que é restrito a `GESTOR_UNIDADE` — assim o dashboard funciona pros dois perfis existentes) e cada card é um `<Link>` clicável pra tela real correspondente. O selo "vs. mês anterior" voltou a aparecer, mas calculado de verdade: como nenhuma entidade é apagada fisicamente neste sistema, `totalNoInícioDoMês = totalAgora − criadosEsteMês` (via `criadoEm`) dá o crescimento real pras contagens cumulativas (Leads, Imóveis). **Simplificação registrada**: pros cards filtrados por estado (Negociações Ativas, Visitas Agendadas, Vendas Fechadas) essa mesma conta é só uma aproximação — não existe tabela de histórico de transição de estado, então o número só consegue mostrar crescimento, nunca uma queda real; o selo de tendência fica oculto (não inventa um "0%") quando a base do mês anterior é zero. Os números também animam de 0 até o valor real toda vez que a página carrega (`useContadorAnimado`, `requestAnimationFrame` com easing ease-out-cubic), efeito puramente visual sem impacto no dado.
- **Tarefas e Configurações (EXTENSÕES REGISTRADAS, 2026-08-02)**: as duas últimas entradas do menu não correspondiam a nenhum artefato formal (`ART-004`/`ART-005`/`ART-009`) nem a uma US numerada do backlog — o escopo veio de decisão direta do usuário deste sistema, não de um requisito documentado. **Tarefas** (`sistema/apps/api/src/modules/tarefas/`, tela `/tarefas`): lembrete/follow-up manual e pessoal do usuário logado (título, prazo opcional, concluída/pendente) — sem vínculo com Lead/Oportunidade/etc. e sem atribuição a outro usuário (sempre dono = quem criou); por não ser uma entidade de `ART-005`, escritas aqui não geram `RegistroDeAuditoria`. **Configurações** (`GET /usuarios/me`, `PATCH /usuarios/me/senha`, tela `/configuracoes`): dados da própria conta (nome/e-mail/perfil) e troca de senha exigindo confirmação da senha atual — deliberadamente não toca dados de unidade/tenant (isso já tem tela própria em Unidades). O item de menu "Configurações" deixou de apontar para `/auditoria` (agora só acessível via link dentro da própria tela de Configurações, "Ver log de auditoria da unidade").

EPIC-08 (WhatsApp) e EPIC-10 (portal prioritário) estão adiados — ambos dependem de decisões comerciais ainda pendentes (fornecedor/BSP em `DEC-TEC-006`; escolha do portal em `DEC-NEG-019`). Com EPIC-11 completo, todos os épicos da Fase 1 sem dependência comercial pendente estão implementados.

## Fase 2 — Locação operacional (2026-08-02 a 2026-08-08)

Backlog completo em `../crm-imobiliario-projeto/artefatos/ART-015-backlog-fase-2.md` (US-101 a
US-113, derivadas de `ART-010-locacao-operacional.md`). **Estado atual: US-101 a US-113 todas
implementadas, só falta US-103** (troca de proprietário, baixa prioridade, o próprio texto da
história diz para adiar até haver necessidade real em produção — YAGNI já registrado). Contrato de
administração, contrato de locação, garantia, vistoria de entrada/saída com contestação, reajuste,
renovação, encerramento automático por vencimento, documentos e portal do proprietário/inquilino
estão implementados sobre as "Opção C" (recomendação técnica) de `DEC-NEG-014` a `016`, ainda
pendentes de aprovação formal dos donos, tratadas como hipótese de trabalho documentada em cada
história abaixo — nunca como regra inventada silenciosamente. **US-111 (multa rescisória) é
diferente**: está implementada, mas **bloqueada de verdade para produção real** (não só documentada
como risco) — a API recusa qualquer chamada a menos que alguém defina
`LOCACAO_MULTA_RESCISORIA_HABILITADA=true` conscientemente no servidor, porque `DEC-NEG-017`
continua pendente e o próprio ART-010 §21 exige esse bloqueio explícito até validação jurídica
formal.

- **US-101 — Cadastrar contrato de administração** (`sistema/apps/api/src/modules/locacao/`,
  `ContratosAdministracaoService`): vincula unidade, imóvel e proprietário (`Pessoa`); rejeita
  duplicidade de contrato `ATIVO` para o mesmo imóvel. **Extensão registrada**: ART-010 §12 não
  especifica se este contrato é por imóvel ou por portfólio do proprietário — implementado 1:1 por
  imóvel (torna RN-401 mecanicamente verificável sem inferir titularidade por outro caminho, ex.
  cruzar com `ImovelCoproprietario`, que é multi-proprietário e não é usado aqui).
- **US-102 — Cadastrar contrato de locação em Rascunho** (RN-401): só aceita administração
  `ATIVO` do mesmo tenant; valida `Imovel.finalidade` (`LOCACAO`/`AMBOS`, campo já existente,
  rejeita imóvel só-venda); `aceitaReajusteNegativo` é obrigatório na criação, nunca com default
  silencioso (RN-407). **Fora de escopo desta fatia**: RN-201 (ART-008, gate de parametrização
  financeira antes de cobrar) não é verificado — ART-008 é Fase 3, ainda não iniciado; nenhum
  campo financeiro especulativo foi adicionado a `ContratoDeLocacao`, que existe hoje só como
  "referência externa" para quando ART-008 for implementado (a dependência aponta de lá pra cá,
  nunca o contrário, conforme o próprio texto de ART-008 §4).
- Máquina de estados de `ContratoDeLocacaoEstado` definida com os 7 estados completos de ART-010
  §8.1, mas só `RASCUNHO` é alcançável via API nesta fatia — as transições (padrão
  `moverEstagioTx` de `OportunidadesService`) ficam para quando Garantia/Vistoria existirem
  (US-104 em diante).
- Testado ponta a ponta contra o Supabase real: criar administração → duplicidade rejeitada →
  criar locação (RASCUNHO) → administração inexistente/`ENCERRADO`/imóvel `VENDA` todos rejeitados
  (400) → listagens escopadas por unidade.
- **US-104/US-105 — Garantia: registrar, ativar e trocar sem janela sem cobertura**
  (`GarantiasService`, RN-402/RN-403): 5 estados (`EM_ANALISE`/`ATIVA`/`EM_SUBSTITUICAO`/
  `EM_LIQUIDACAO`/`ENCERRADA`, ART-010 §8.2). Registrar cria `EM_ANALISE`; `ativar` é uma
  "validação concluída" (endpoint não listado literalmente em ART-010 §14, mas necessário — a
  transição não acontece sozinha). **RN-403 (CA-402) implementada de forma que a garantia atual
  nunca é encerrada antes da nova estar pronta**: `trocar` só marca a garantia atual como
  `EM_SUBSTITUICAO` (nunca `ENCERRADA` diretamente) e cria a nova em `EM_ANALISE` com
  `substituiGarantiaId` apontando pra ela; só quando a nova é `ativar`ada é que a antiga vira
  `ENCERRADA`, **na mesma transação** — nunca há um instante com as duas `ATIVA` nem as duas
  não-`ATIVA` ao mesmo tempo. Tipo `FIADOR` exige `fiadorPessoaId` (validado no tenant); os
  demais tipos rejeitam esse campo se enviado (nunca ignora silenciosamente um dado que não se
  aplica). Testado ponta a ponta contra o Supabase real, incluindo o ciclo completo de troca:
  registrar → ativar → trocar → confirma antiga `EM_SUBSTITUICAO`/nova `EM_ANALISE` → tentar
  trocar de novo falha (não há `ATIVA`) → ativar a substituta → confirma antiga `ENCERRADA`/nova
  `ATIVA`. RN-402 em si (bloquear `ContratoDeLocacao` de virar `Vigente` sem garantia `ATIVA`)
  ainda não é verificado em lugar nenhum — só existirá quando a ativação do contrato for
  implementada (US-106).
- **US-106 — Vistoria de entrada + máquina de estados do contrato até Vigente**
  (`VistoriasService`, `ContratosLocacaoService.moverEstagioTx`, RN-402/RN-404, CA-401):
  primeira vez que a máquina de estados de `ContratoDeLocacao` (§8.1) é de fato exercitada —
  antes só `RASCUNHO` era alcançável via API. Implementado: `RASCUNHO → EM_ASSINATURA →
  AGUARDANDO_VISTORIA_ENTRADA → VIGENTE`, mesmo padrão de `TRANSICOES_VALIDAS` +
  `moverEstagioTx` de `OportunidadesService`. **Correção registrada**: o campo `exigeGarantia`
  (RN-402) deveria ter sido criado junto com o resto do contrato em US-102, mas nunca foi — corrigido
  agora, obrigatório na criação (mesmo espírito de `aceitaReajusteNegativo`, nunca assumido
  silenciosamente). **Resolução de uma inconsistência do próprio ART-010**: a tabela de estados
  (§8.1) cita RN-402 como condição de `Rascunho → Em assinatura`, mas o CA-401 (mais preciso) é
  explícito que o bloqueio é sobre a transição pra `Vigente` — implementado seguindo o CA-401.
  `VistoriasService.realizarLaudo` (RN-404: laudo de vistoria de ENTRADA) aciona
  automaticamente `moverEstagioTx(..., 'VIGENTE', ...)` **na mesma transação** quando aplicável
  (mesmo padrão de `VisitasService` acionando `OportunidadesService.moverEstagioTx`) — o gate
  combina RN-404 (vistoria de entrada `REALIZADA`) e RN-402 (garantia `ATIVA`, só quando
  `exigeGarantia`); se qualquer um falhar, **a transação inteira reverte** (o laudo em si não
  fica gravado até o contrato conseguir avançar), provado por teste real contra o Supabase.
  **Permissão** (ART-010 §13, "apenas Vistoriador"): reaproveita `GESTOR_UNIDADE` nesta fatia —
  sem perfil `VISTORIADOR` próprio no `UsuarioPerfil` (decisão do usuário, simplificação
  registrada); `CORRETOR` recebe 403 ao tentar registrar laudo. Contestação de vistoria (RN-405,
  específica de saída) fica para US-107. Tela `/locacao` ganhou botões de transição
  (avançar/confirmar assinatura) e seção de vistoria de entrada (agendar + registrar laudo) por
  contrato.
- **US-107 — Vistoria de saída com contestação por segunda análise independente**
  (`VistoriasService.registrarContestacao`/`decidirContestacao`/`executarVarreduraAutomaticaTx`,
  RN-405, CA-403, DEC-NEG-016): abre um prazo formal de contestação (hipótese de trabalho,
  DEC-NEG-016, "Opção C": 5 dias úteis via `somarDiasUteis`, sem calendário de feriados —
  simplificação registrada) quando o laudo de uma vistoria de SAIDA é registrado. Contestar é
  aberto a qualquer usuário do tenant (canal assistido, já que o portal do proprietário/inquilino
  de RN-413 ainda não existe) — move a vistoria para `EM_CONTESTACAO`. Decidir a contestação é
  restrito a `GESTOR_UNIDADE` **e nunca pode ser a mesma pessoa que registrou o laudo original**
  (TEST-403: checado por identidade de usuário via `Vistoria.realizadoPorUsuarioId`, não só por
  perfil) — a vistoria assume o estado da decisão (`CONFIRMADA` ou `RETIFICADA`). Se ninguém
  contestar dentro do prazo, o `SchedulerService` (mesmo job de 5 min que já varre
  leads/reservas/carteiras) confirma automaticamente (`REALIZADA → CONFIRMADA`, ator sistema),
  fechando a transição de ART-010 §8.3. **Correção registrada**: `Vistoria` não tinha
  `realizadoPorUsuarioId` até aqui — sem ele não dava pra checar TEST-403; adicionado nesta
  história junto com `prazoContestacaoAte`. **Extensões registradas**: contestação é exclusiva de
  vistoria de SAIDA (ENTRADA é rejeitada, ART-010 §8.3 só fala de contestação "ao final do
  contrato"); agendar vistoria de SAIDA aceita o contrato `VIGENTE` além dos dois estados de
  encerramento — como US-109/110/111 (que levariam o contrato a `EM_ENCERRAMENTO`) ainda não
  existem nesta fatia, `VIGENTE` é o único estado real hoje pra exercitar US-107. **Fora de
  escopo**: retenção financeira do valor contestado (RN-217/ART-008 por analogia) — Fase 3 ainda
  não começou. Tela `/locacao` ganhou seção de vistoria de saída (agendar + laudo + contestar +
  decidir) por contrato. Testado ponta a ponta contra o Supabase real: contrato levado a Vigente,
  vistoria de saída com laudo registrado (prazo calculado), `CORRETOR` rejeitado no laudo (403),
  contestação registrada por um `CORRETOR` (canal assistido), decisão rejeitada pro autor original
  do laudo (403) e pro `CORRETOR` (403), decisão aceita por um segundo `GESTOR_UNIDADE`
  (`RETIFICADA`), nova contestação sobre a mesma vistoria rejeitada (400, já decidida).
- **US-108 — Reajuste por índice e competência** (`ReajustesService`, RN-406/RN-407, DEC-NEG-015):
  aplica o reajuste periódico usando o índice já declarado no contrato (`ContratoDeLocacao.indiceReajuste`,
  copiado pro `Reajuste` no momento da aplicação — RN-406, "usa o índice declarado no contrato",
  não um índice escolhido livremente na chamada). Valor do índice por competência é capturado
  manualmente (`percentualIndice`, hipótese de trabalho DEC-NEG-015 — integração com provedor de
  dados econômicos é decisão técnica separada, fora de escopo); `competencia` (formato "AAAA-MM")
  é única por contrato — reaplicar a mesma competência é rejeitado (RN-406/DEC-ARQ-006: "nunca
  recalculado retroativamente"). **RN-407 (piso zero)**: se o índice do período for negativo
  (deflação) e o contrato não tiver declarado `aceitaReajusteNegativo`, `percentualAplicado` vira
  `0` em vez do valor negativo recebido — nunca assumido silenciosamente, o campo já era
  obrigatório desde a criação do contrato (US-102). Cada aplicação atualiza
  `ContratoDeLocacao.valorAluguel` e grava uma linha em `Reajuste` com `valorAluguelAnterior`/`valorAluguelNovo`
  — a própria tabela `Reajuste` é o histórico versionado (RN-412), sem precisar de
  `vigenteDe`/`vigenteAte` no contrato. **Extensão registrada**: só é possível aplicar reajuste a
  um contrato `VIGENTE` (parte do ciclo de cobrança durante a vigência, ART-010 fluxo principal
  passo 6). **Permissão**: EXTENSÃO REGISTRADA — ART-010 §13 não cita "aplicar reajuste"
  explicitamente; reaproveita `GESTOR_UNIDADE`, mesma decisão de perfil das histórias anteriores
  ("Financeiro" não existe como perfil próprio nesta fatia); `CORRETOR` recebe 403. Tela `/locacao`
  ganhou seção de reajuste (competência + percentual do índice) por contrato. Testado ponta a
  ponta contra o Supabase real: `CORRETOR` rejeitado (403), reajuste de 5% aplicado (R$ 2.500 →
  R$ 2.625), reaplicar a mesma competência rejeitado (400), reajuste de -2% numa nova competência
  com piso zero aplicado (contrato não aceita reajuste negativo — valor permanece R$ 2.625).
- **US-109/US-110 — Renovação com confirmação humana + encerramento automático por vencimento**
  (`RenovacoesService`, `ContratosLocacaoService.executarVarreduraAutomaticaTx`, RN-408/RN-409,
  DEC-NEG-015): `ContratoDeLocacao` ganhou `vencimentoAtual` (calculado na criação como
  `dataInicio + prazoMeses`, migration com backfill dos contratos já existentes) — sempre reflete
  o vencimento do período vigente. `POST /locacao/contratos/:id/renovacao` (`{ prazoAdicionalMeses }`,
  restrito a `GESTOR_UNIDADE`) nunca é automático — cada confirmação grava uma linha em `Renovacao`
  (vínculo ao período anterior e ao novo, RN-412) e estende `vencimentoAtual`. Sem renovação a
  tempo, `SchedulerService` (mesmo cron de 5 min de sempre) varre contratos `VIGENTE` com
  `vencimentoAtual` no passado e move para `EM_ENCERRAMENTO` via o chokepoint `moverEstagioTx`, com
  ator sistema (`atorUsuarioId: null`) — `TRANSICOES_VALIDAS['VIGENTE']` ganhou essa única saída
  nesta fatia. "Inicia vistoria de saída" (ART-010 §8.1) não agenda nada sozinho: só libera o
  estado que `VistoriasService.agendar('SAIDA', ...)` já aceitava desde US-107. **Simplificação
  registrada**: o "alerta" de 60 dias de antecedência (DEC-NEG-015) não tem canal de notificação
  próprio nesta fatia (sem e-mail/push no sistema) — `vencimentoAtual` fica visível na tela
  `/locacao` como sinal visual; renovação pode ser confirmada a qualquer momento com o contrato
  `VIGENTE`, não só dentro da janela de alerta (RN-408 não exige essa restrição). Testado ponta a
  ponta contra o Supabase real: `CORRETOR` rejeitado (403), renovação de 12 meses estendendo
  `vencimentoAtual` (2027-08-01 → 2028-08-01), e — pra provar o encerramento automático sem
  esperar o cron real — `vencimentoAtual` retrocedido administrativamente simulando o vencimento
  chegado, com a mesma consulta/atualização de `executarVarreduraAutomaticaTx` executada sob o
  role de aplicação com contexto RLS de verdade (`set_config('app.tenant_id', ...)`): moveu o
  contrato pra `EM_ENCERRAMENTO`, gravou auditoria com ator sistema, e confirmar renovação depois
  disso foi rejeitado (400).
- **US-112 — Documentos do contrato** (`DocumentosService`, RN-411): `POST /locacao/contratos/:id/documentos`
  (`tipo` do catálogo `CONTRATO_ASSINADO`/`LAUDO_VISTORIA`/`COMPROVANTE_GARANTIA`/`TERMO_RENOVACAO`/`TERMO_RESCISAO`/`OUTRO`,
  `descricao`, `referencia`) centraliza documentos vinculados ao ciclo de vida do contrato.
  **Simplificação registrada**: mesma decisão já tomada em `Vistoria.evidencias` (US-106) —
  `referencia` é texto livre (URL/descrição de onde o documento real está guardado), sem upload de
  arquivo, storage ou verificação antimalware nesta fatia (ART-012 já lista "Armazenamento de
  documentos... A definir" como decisão de infraestrutura futura). **Pendência não escondida**:
  período de retenção pós-encerramento continua a definir em DEC-NEG-018 (ainda "Pendente" em
  ART-012) — sem campo de expiração/descarte automático, documentos ficam visíveis indefinidamente
  até essa decisão ser tomada. **Permissão**: EXTENSÃO REGISTRADA — diferente das ações
  financeiras/contratuais restritas a `GESTOR_UNIDADE` desta fase, anexar documento é aberto a
  qualquer usuário autenticado do tenant (ART-010 §13 não restringe essa ação). Tela `/locacao`
  ganhou seção de documentos por contrato. Testado ponta a ponta contra o Supabase real:
  `CORRETOR` e `GESTOR_UNIDADE` anexando tipos diferentes de documento, tipo inválido rejeitado
  pelo DTO (400), contrato inexistente rejeitado (404), listagem dos documentos anexados.
- **US-113 — Portal do proprietário/inquilino (somente leitura)** (`PortalService`, RN-413):
  nenhum artefato especifica autenticação de `Pessoa` (proprietário/inquilino nunca fazem login
  como `Usuario`) — **decisão técnica registrada**: acesso por token opaco de alta entropia
  (`crypto.randomBytes(32)`), gerado por um `GESTOR_UNIDADE` (`POST /locacao/contratos/:id/portal/acessos`,
  valida que a pessoa é o proprietário ou o inquilino **deste contrato**, RN-413 — rejeita
  qualquer outro, 400) e entregue fora da banda (token só aparece uma vez na resposta/tela, sem
  e-mail/SMS real nesta fatia). Mesmo padrão de segurança do refresh token: só o hash SHA-256 fica
  persistido, nunca o valor puro. Consulta pública `GET /portal/contratos/:token` (`@Public()`,
  sem JWT — quem acessa nunca é um `Usuario`) não tem nenhum outro identificador na URL além do
  token, então não há "manipulação de identificador" possível (ART-010 §17); erro sempre genérico
  (404) pra token inexistente/expirado/revogado, nunca revela qual dos três. **Mecanismo de RLS
  novo**: como a consulta pública não conhece o tenant de antemão, `acesso_portal_contrato` ganhou
  uma segunda política (`FOR SELECT USING (true)`), mesmo padrão de `rls_tenant_leitura_app` (already
  usado pelo `SchedulerService` pra enumerar tenants) — uma linha desta tabela não expõe dado
  sensível por si só; o contrato de verdade só é lido depois, já dentro do tenant resolvido a
  partir do token. Throttle extra (`20/min` por IP) na rota pública, mesmo raciocínio do login.
  Gerar/revogar/listar acesso restrito a `GESTOR_UNIDADE`; `CORRETOR` recebe 403. Nova página
  pública `/portal/[token]` (fora do `AppShell` autenticado — `app-shell.tsx` passou a tratar
  `/portal/*` como rota pública, mesmo critério de `/login`) mostra endereço, estado, valor,
  documentos, vistorias, reajustes e renovações do contrato, só leitura. Testado ponta a ponta
  contra o Supabase real: `CORRETOR` rejeitado ao gerar acesso (403), gerar acesso pra pessoa
  errada rejeitado (400), token retornado em texto puro, consulta pública sem `Authorization`
  retornando o resumo completo, token inválido rejeitado (404), `CORRETOR` rejeitado ao
  listar/revogar (403), revogação funcionando e imediatamente invalidando o token (404 na consulta
  seguinte), revogação idempotente, e as duas páginas (`/portal/[token]` pública e `/locacao`
  interna) renderizando no navegador.
- **US-111 — Encerramento antecipado com multa e isenção auditada** (`EncerramentoAntecipadoService`,
  RN-410/CA-405, DEC-NEG-017): implementado como **exercício técnico bloqueado para produção real**,
  a pedido explícito do usuário depois de eu flagar o risco jurídico (ART-010 §21: "bloquear uso em
  produção real até validação jurídica explícita, mesmo que o desenho técnico avance"). Hipótese de
  trabalho técnica (não é afirmação jurídica): `multa = valorReferencia × (mesesRestantes / mesesTotais)`,
  arredondada e nunca maior que `valorReferencia` (protege contra `mesesRestantes > mesesTotais`
  depois de uma renovação, US-109) — `valorReferencia` é o `valorAluguel` vigente no momento
  (**extensão registrada**, nenhum artefato define um campo separado); meses contados por
  granularidade de mês-calendário, ignorando o dia (**simplificação registrada**). Isenção exige
  `motivoIsencao` (apuração formal, RN-410) — checado no service, não só no DTO — e zera a multa.
  **O bloqueio é real, não só documentação**: `EncerramentoAntecipadoService.solicitar` recusa
  **qualquer chamada**, mesmo de `GESTOR_UNIDADE`, a menos que a variável de ambiente
  `LOCACAO_MULTA_RESCISORIA_HABILITADA` esteja definida exatamente como `"true"` no ambiente do
  servidor (ausente por padrão em `.env.example`) — sem isso, 403 sempre, antes até de checar
  permissão de perfil. `listar` (leitura) não é afetado pelo gate. Tela `/locacao` mostra um banner
  de alerta bem visível na seção. Testado ponta a ponta contra o Supabase real, nos dois sentidos:
  bloqueio confirmado por padrão (403); com a variável ligada temporariamente no `.env` real
  (servidor reiniciado, testado, variável revertida, servidor reiniciado de novo) — `CORRETOR`
  rejeitado (403), isenção sem motivo rejeitada (400), multa calculada certa (contrato de
  R$ 3.000/mês com os 12 meses inteiros restantes → 100% → R$ 3.000), contrato movido pra
  `EM_ENCERRAMENTO_ANTECIPADO`, segunda tentativa rejeitada (400, contrato não é mais Vigente); e
  depois de reverter a variável, o bloqueio voltou a valer imediatamente.

**Correção de segurança importante (revisão de 2026-08-08 — escopo de unidade ausente nos recursos aninhados de Locação):**
uma revisão de segurança sobre o módulo de Locação (US-104 a US-113) achou que `GarantiasService`,
`VistoriasService`, `ReajustesService`, `RenovacoesService`, `DocumentosService`, `PortalService`
(gerar/revogar/listar acesso) e `EncerramentoAntecipadoService` escopavam toda leitura/escrita só
por `tenantId`, nunca pela `unidadeId` de quem chamava — diferente do padrão já estabelecido em
`ContratosLocacaoService`/`ContratosAdministracaoService` (listagem raiz) e em leads/imóveis/
oportunidades/checklist/visitas/propostas/reservas (ver "Escopo de unidade nas listagens" acima).
Na prática: qualquer usuário autenticado do tenant — de **qualquer** unidade — conseguia ler
garantias, vistorias, reajustes, documentos e até **gerar/revogar acesso ao portal externo do
proprietário/inquilino** de um contrato pertencente a uma unidade diferente da sua, bastando saber
o UUID do contrato. Corrigido escopando cada consulta ao contrato por
`contratoDeAdministracao: { unidadeId }` (mesmo padrão relacional já usado em
`ContratosLocacaoService.listar`), em todos os sete serviços e seus controllers. Testado ponta a
ponta contra o Supabase real: um `GESTOR_UNIDADE` de uma segunda unidade tentando listar
vistorias/garantias/reajustes/documentos e gerar acesso de portal de um contrato de outra unidade
recebeu 404 em todos os casos; o mesmo `GESTOR_UNIDADE` da unidade certa continuou funcionando
normalmente (200). De quebra, a mesma revisão também tirou `realizadoPorUsuarioId`
(`Vistoria`)/`anexadoPorUsuarioId` (`DocumentoDeContrato`) — UUIDs internos de `Usuario`, sem
utilidade legítima pro titular externo — do retorno de `GET /portal/contratos/:token` (confirmado
via curl que os dois campos somem do JSON público). **Simplificação registrada, não corrigida
agora**: a política de RLS `acesso_portal_contrato_leitura_por_token` (necessária pro lookup
público por token, sem tenant conhecido de antemão) deixa esta UMA tabela sem o backstop de RLS
pra leitura — hoje os três call sites que leem essa tabela já filtram `tenantId` em código, mas ao
contrário de toda outra tabela do sistema, um esquecimento futuro não seria pego pela Row-Level
Security. Documentado no schema e aceito como tradeoff consciente (mesmo espírito de
`rls_tenant_leitura_app`), não como pendência a fechar.

**Pendências técnicas conhecidas, registradas e não escondidas:**
- **Fechada**: deduplicação de lead (US-007, CA-002) — ver "EPIC-03" acima.
- **Atualizado**: reabertura de lead por SLA vencido (US-008), marcação de inatividade (US-009), expiração de reserva (US-018) e escalonamento de transferência de carteira vencida (US-010, CA-002) agora rodam por agendador real (`SchedulerService`, cron a cada 5 min, ver "Transversal" abaixo), além da checagem preguiçosa embutida (mantida para consistência imediata em leitura). Cadência de 5 min é hipótese de trabalho, ajustável em código sem migração.
- US-010, CA-002: uma vez `ESCALADA_MATRIZ`, o item fica visível mas sem nenhuma forma de decisão via API — o perfil "Gestor da matriz" não existe nesta fatia. Hoje só é destravável com update direto no banco.

**Correção de segurança importante (identidade real em vez de `usuarioId` enviado pelo cliente):**
até esta rodada, `POST /leads/:id/interacoes`, `POST /oportunidades`, `POST /oportunidades/:id/fechar`,
`POST /oportunidades/:id/tentativas-contato`, `POST /visitas`, `POST /oportunidades/:id/propostas`
(+ contraproposta), `POST /oportunidades/:id/reservas` e as rotas do radar aceitavam um `usuarioId`
enviado pelo **corpo/query da requisição** para decidir "quem está agindo" — mesmo já existindo uma
sessão JWT autenticada. Isso permitia que qualquer usuário autenticado do tenant agisse "como" outro
usuário só informando o ID certo no corpo (ex.: criar oportunidade para um lead alheio informando o
`usuarioId` do responsável de verdade). Corrigido: todos esses endpoints agora derivam o ator sempre
de `CurrentUsuario()` (o JWT verificado), e `usuarioId` foi **removido** dos tipos de input
correspondentes em `packages/shared` — não é mais um campo aceito no corpo, então nem chega a ser
lido. Testado ponta a ponta: um corretor autenticado tentando criar oportunidade para um lead de
outro responsável agora recebe 400 (antes teria sucesso bastando informar o `usuarioId` certo).

**Escopo de unidade nas listagens (`GET /leads`, `GET /imoveis`, `GET /oportunidades`):**
até esta rodada, essas três listagens retornavam **tudo do tenant**, sem checar a `unidadeId` de
quem estava pedindo — um `CORRETOR` ou `GESTOR_UNIDADE` de qualquer unidade conseguia listar leads,
imóveis e o Kanban de oportunidades de outra unidade do mesmo tenant (Regra 4 de
`perfis-e-permissoes.md`: "usuário de uma unidade não acessa outra sem regra explícita"). Corrigido:
`LeadsService.listar`/`OportunidadesService.listar` agora filtram por `unidadeId` do chamador (a
`Oportunidade` usa a unidade do seu `Lead`, não do imóvel — cobre o caso de imóvel compartilhado de
outra unidade, tratado à parte por RN-309/`ComissaoCruzadaAcionada`); `ImoveisService.listar` usa o
mesmo critério de visibilidade que o radar já aplicava (US-022): imóvel da própria unidade **OU**
`COMPARTILHADO` com a rede — nunca um imóvel `EXCLUSIVO_DA_UNIDADE` de outra unidade. Testado ponta
a ponta com duas unidades reais no mesmo tenant: cada uma via só seus próprios leads/oportunidades,
e imóveis compartilhados cruzavam a fronteira enquanto os exclusivos não.

**Permissões de ação no funil de vendas (checklist, visitas, propostas, reservas, mover/tentativa de
contato):** a seção "Permissões" de US-013 a US-019 (ART-014) sempre exigiu "responsável pela
oportunidade" (ou, em US-019, "Administrativo, Gestor de unidade") para cada ação — mas isso nunca
foi verificado em código: `POST /oportunidades/:id/mover`, `.../tentativas-contato`, `POST /visitas`
(+ `.../confirmar`, `.../cancelar`, `.../realizar`), `POST /oportunidades/:id/propostas` (+
contraproposta), `POST /propostas/:id/aceitar` e `POST /oportunidades/:id/reservas` aceitavam
qualquer usuário autenticado do tenant, de qualquer unidade. Corrigido:
`OportunidadesService.validarResponsavelDaOportunidade` (novo método público, reaproveitado por
Visitas/Propostas/Reservas) verifica que o ator é `Lead.responsavelUsuarioId` antes de qualquer uma
dessas ações — sem exceção para `GESTOR_UNIDADE`, porque ART-014 não registra essa exceção para
estas ações específicas (postura default-deny). **Exceção deliberada**: `ChecklistService.concluirItem`
segue a permissão literal de US-019 ("Administrativo, Gestor de unidade") — só `GESTOR_UNIDADE` marca
item de checklist, mesmo que seja o próprio corretor responsável tentando. As leituras
(`GET .../checklist`, `.../propostas`, `.../reservas`, `GET /visitas?oportunidadeId=`) continuam
abertas a qualquer usuário **da mesma unidade** (não só ao responsável), para o Gestor de unidade
acompanhar o funil inteiro (US-011). Testado ponta a ponta em todo o funil (mover, tentativa de
contato, agendar/confirmar/realizar visita, registrar/aceitar proposta, formalizar reserva, concluir
checklist): responsável sempre passa, colega de unidade sempre é rejeitado na escrita mas passa na
leitura, e corretor responsável é rejeitado especificamente no checklist (só gestor conclui).

**Pendências conhecidas de autenticação (US-002/US-003), registradas e não escondidas:**
- só 2 dos 16 perfis de ART-006 existem (`GESTOR_UNIDADE`/`CORRETOR`) — sem `AtribuicaoDePerfil`, acesso emergencial, dupla aprovação ou MFA (todos dependem de módulos/decisões que ainda não existem nesta fatia);
- **Atualizado**: `GET /leads`, `GET /imoveis` e `GET /oportunidades` escopam por `unidadeId` do chamador (ver "Escopo de unidade nas listagens", acima), e os endpoints aninhados de checklist/visitas/propostas/reservas também passaram a checar unidade na leitura e responsável na escrita (ver "Permissões de ação no funil de vendas", acima). Junto com `POST /usuarios`, `POST /usuarios/:id/desligar`, `GET /indicadores` e o módulo `carteiras`, isso cobre **listagens de topo e sub-recursos aninhados** por `perfil`/`unidadeId`/responsável. **Ainda não coberto**: `GET /leads`/`GET /imoveis`/`GET /oportunidades` continuam mostrando tudo da unidade para `CORRETOR`, não só os itens sob sua responsabilidade — US-011 sugere "Corretor vê suas oportunidades" de forma mais restrita; mantido unit-wide por ora para não fragmentar a visão de equipe na UI atual (ver comentário em `OportunidadesService.listar`);
- **Fechada (2026-08-02)**: refresh token real (`AuthService`/`RefreshToken`, migration `refresh_token`). Access token agora dura só 1h (`typ: 'access'` no JWT); refresh token dura 30 dias (`typ: 'refresh'`, hipótese de trabalho sem decisão de produto formal), armazenado no banco só como hash SHA-256 (nunca em texto puro) e **rotacionado a cada uso** — `POST /auth/refresh` revoga o refresh token recebido e emite um par novo; reuso de um refresh token já rotacionado/revogado é rejeitado (sinal de possível token roubado), mesmo com assinatura JWT ainda válida. `JwtAuthGuard` rejeita um refresh token usado diretamente como access token (`typ` incompatível) — sem isso, um refresh token vazado seria utilizável por 30 dias em qualquer rota. `POST /auth/logout` revoga o refresh token da sessão atual (idempotente/silencioso, nunca lança). Front-end (`lib/api.ts`) tenta renovar a sessão silenciosamente em qualquer 401 antes de desistir, e `auth-context.tsx` tenta a mesma renovação ao restaurar sessão na abertura do app — usuário só volta para `/login` se o refresh token também estiver expirado/revogado. **Simplificação registrada**: sem job de limpeza de linhas expiradas/revogadas na tabela `refresh_token` (cresce sem GC automático, aceitável no volume atual).
- **Revisado (2026-08-02)**: bootstrap de tenant novo continua manual/administrativo por decisão deliberada, não por falta de tempo — `apps/api/scripts/gerar-hash-senha.js` agora gera o SQL completo (Tenant + Unidade matriz + primeiro `GESTOR_UNIDADE`, uma transação só) em vez de só o hash de senha, fechando a dor prática (antes eram 2 passos manuais em ferramentas diferentes) sem expor isso como endpoint da API — ver "Como rodar localmente" acima para o porquê.
- **Fechada (2026-08-04)**: sem rate limiting no login. Duas camadas independentes, deliberadamente redundantes: (1) `ThrottlerModule` (`@nestjs/throttler`) como guard global — 100 req/min por IP em toda a API, 20 req/min por IP especificamente em `POST /auth/login` (`app.module.ts`, `@Throttle` em `AuthController`); (2) `LoginLockoutService` — bloqueia a combinação `(tenantId, email)` por 15 min após 5 falhas em 15 min, **independente do IP de origem** (a defesa real contra um atacante que roda a mesma senha contra uma conta específica trocando de IP a cada tentativa, o que o throttling por IP sozinho não pega). O bloqueio usa a mesma mensagem genérica de sempre — inclusive para e-mail inexistente, para nunca vazar se uma conta existe ou está bloqueada. **Simplificação registrada**: `LoginLockoutService` guarda o estado em memória do próprio processo — não sobrevive a um restart nem funciona corretamente com mais de uma instância da API rodando (precisaria de um armazenamento compartilhado tipo Redis); aceitável hoje porque a API roda como processo único, sem horizontal scaling configurado em lugar nenhum. Testado ponta a ponta contra o Supabase real: 5 tentativas com senha errada, a 6ª rejeitada mesmo com a senha certa.
- **Fechada (2026-08-06)**: direitos do titular de dados pessoais (ART-012, DEC-NEG-018) — correção e eliminação sobre `Pessoa`. `PATCH /pessoas/:id` (`PessoasService.atualizar`, aberto a qualquer usuário autenticado do tenant) corrige nome/documento/telefone, audita `PESSOA_DADOS_CORRIGIDOS` e rejeita edição em titular já anonimizado. `POST /pessoas/:id/eliminacao` (`PessoasService.solicitarEliminacao`, restrito a `GESTOR_UNIDADE`, 403 para os demais perfis) implementa a "Opção C" recomendada em DEC-NEG-018: nunca é `DELETE` físico (as FKs de `ContratoDeAdministracao`/`ContratoDeLocacao`/`Garantia`/`ImovelCoproprietario` apontam pra `Pessoa` com `ON DELETE RESTRICT` de propósito — apagar quebraria histórico contratual que a própria LGPD art. 16 permite reter por obrigação legal) — em vez disso **anonimiza** (`nome`, `documentoNormalizado`, `telefoneNormalizado` sobrescritos, `anonimizadoEm` preenchido), liberando o documento/telefone para reuso por outra pessoa. Pedido é **bloqueado com 400** se a pessoa ainda for proprietário em `ContratoDeAdministracao` `ATIVO`, inquilino em `ContratoDeLocacao` não-`ENCERRADO`, fiador (`Garantia`) num contrato não-`ENCERRADO`, ou coproprietário vigente (`ImovelCoproprietario.vigenteAte: null`) — deliberadamente **não** considera lead/prospecção ativa como bloqueio (DEC-NEG-018 trata isso como interesse legítimo de janela curta, não obrigação legal de retenção). Eliminação é idempotente (chamar de novo num titular já anonimizado retorna o estado atual, sem re-auditar nem lançar erro) e auditada (`PESSOA_ANONIMIZADA`, com o `motivo` informado). **Correção registrada**: `telefoneNormalizado` já existia no schema e já era usado por `LeadsService.capturar`, mas `POST /pessoas` nunca aceitava esse campo — corrigido junto. Nova página `/pessoas` (criar, corrigir, solicitar eliminação, com aviso visual pra titular já anonimizado). Testado ponta a ponta contra o Supabase real: criação com telefone, conflito de telefone duplicado (400), correção, bloqueio de eliminação por contrato de administração ativo (400), `CORRETOR` tentando eliminar (403), eliminação bem-sucedida por `GESTOR_UNIDADE` (anonimiza), edição pós-anonimização rejeitada (400), eliminação chamada duas vezes (idempotente), e reuso do telefone liberado por uma pessoa nova (201).

**Pendências conhecidas de auditoria, registradas e não escondidas:**
- **Fechada**: distribuição automática de lead, reabertura por SLA vencido, marcação de inatividade e expiração de reserva agora geram `RegistroDeAuditoria` com ator sistema (`atorUsuarioId: null`) — ver `SchedulerService` e "ator sistema" acima. `RegistroDeAuditoria.atorUsuarioId` deixou de ser obrigatório para viabilizar isso.
- `AcessoDetalhadoMatriz` (um dos itens obrigatórios de ART-005 §9) não existe como entidade nesta fatia — `TransferenciaDeCarteira` passou a existir e ser auditada com US-010, CA-002;
- `Visita.estado`/`Proposta.status` em si ainda não são auditados isoladamente — só a sincronização de `Oportunidade.estado` que essas ações disparam (via `moverEstagioTx`) é, mais a expiração de `Reserva.estado` (auditada via `SchedulerService`). ART-005 §9 não exige auditar essas entidades explicitamente, então essa lacuna é uma decisão consciente de escopo, não um esquecimento.

## Como rodar localmente

### Opção A — Supabase (o que está em uso agora)

1. `npm install` na raiz do monorepo.
2. Crie um projeto gratuito em [supabase.com](https://supabase.com) e um role de aplicação sem `BYPASSRLS` (ver SQL em `db/init/001_create_app_role.sql` — adapte e rode no SQL Editor do Supabase).
3. Copie `apps/api/.env.example` para `apps/api/.env` e preencha `DATABASE_URL` (role `crm_app`, sem privilégio de superusuário), `MIGRATE_DATABASE_URL` (role `postgres`, administrador) e `JWT_SECRET` (gere um valor com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
4. Rode as migrations com a URL de administrador (bash: `DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma`; PowerShell: `$env:DATABASE_URL = "..."` antes do mesmo comando).
5. `npm run build --workspace=packages/shared`
6. `npm run start:dev --workspace=apps/api` (terminal 1)
7. `npm run dev --workspace=apps/web` (terminal 2)
8. Bootstrap do primeiro tenant: `node apps/api/scripts/gerar-hash-senha.js "Razão Social" "Unidade Matriz" "Nome do Gestor" "gestor@empresa.com" "senha-forte"` gera um SQL completo (Tenant + Unidade matriz + primeiro usuário `GESTOR_UNIDADE`, tudo em uma transação) pronto para colar no SQL Editor do Supabase (role administrador). **Deliberadamente sem endpoint na API para isso** — a tabela `tenant` só tem política de RLS de leitura para o role `crm_app` usado em runtime (ver migration `rls_tenant_leitura_app`); criar um tenant é dar acesso a um cliente novo da plataforma, uma operação rara e sensível o bastante para justificar continuar exigindo acesso administrativo direto ao banco, não uma rota HTTP protegida só por segredo. (Uso legado do mesmo script, só a senha, para um usuário avulso em tenant/unidade já existentes: `node apps/api/scripts/gerar-hash-senha.js "sua-senha"`.) A partir daí, use a tela `/login` normalmente; novos corretores são criados pela própria UI (US-002).
9. `npm run test:integration --workspace=apps/api` roda contra este mesmo banco (precisa de `DATABASE_URL`/`MIGRATE_DATABASE_URL` reais, por isso fica fora do `npm test` padrão) — prova o isolamento de tenant via Row-Level Security de ponta a ponta (ver "O que já está implementado" acima). Cria e limpa seus próprios dados a cada execução.
10. `npm run test:e2e --workspace=apps/api` também roda contra este mesmo banco, mas sobe a aplicação Nest inteira e chama por HTTP de verdade (`supertest`) — cobre o que teste de service com Prisma mockado estruturalmente não cobre (ver "O que já está implementado" acima). Cria e limpa seus próprios tenants de teste a cada execução.

### Opção B — Docker local (Postgres + Redis)

Pré-requisitos: Docker Desktop + WSL2 (Windows).

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env   # ajuste DATABASE_URL/MIGRATE_DATABASE_URL para localhost
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_imobiliario?schema=public" \
  npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
npm run build --workspace=packages/shared
npm run start:dev --workspace=apps/api    # terminal 1
npm run dev --workspace=apps/web          # terminal 2
```

A API sobe em `http://localhost:3001`, o front-end em `http://localhost:3000`.

## Problemas reais já encontrados e corrigidos (fique atento se aparecerem de novo)

- **`Cannot find module dist/main` ao rodar `start:dev`:** cache incremental do TypeScript (`tsconfig.tsbuildinfo`) ficando dessincronizado do `dist/` real, geralmente depois de rodar `typecheck` (que também escreve cache incremental) intercalado com `build`. Corrigido separando o arquivo de cache do `typecheck` (`--tsBuildInfoFile dist/.typecheck.tsbuildinfo`) e desligando `deleteOutDir` no `nest-cli.json` (evita corrida entre apagar e recriar o `dist` no Windows). Se voltar a acontecer: apague `apps/api/tsconfig.tsbuildinfo` e rode `npx tsc -p apps/api/tsconfig.json` manualmente para checar.
- **`Environment variable not found: DATABASE_URL` ao subir a API:** Nest não carrega `.env` sozinho. `src/main.ts` importa `dotenv/config` como a primeira linha — não remova.
- **Processos "fantasmas" no Windows:** matar uma tarefa em segundo plano (`nest start --watch`) às vezes não mata o processo filho `node dist/main`, que fica travando o arquivo do Prisma Client (`EPERM` ao rodar `prisma generate`) e a porta 3001. Se acontecer, liste com `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"` e finalize os processos cujo `CommandLine` referencia `CRM\sistema`.
- **`Failed to fetch` no navegador:** CORS. A API só aceita chamadas da origem configurada em `CORS_ORIGIN` (padrão `http://localhost:3000`), configurado em `src/main.ts` via `app.enableCors(...)`.
- **`new row violates row-level security policy`:** falta política RLS para a tabela (ver seção "Banco de dados em uso" acima).
- **`Foreign key constraint violated` ao criar unidade/imóvel:** o tenant usado no login não existe na tabela `tenant`. Insira um tenant de teste com o role administrador antes de usar a aplicação (não existe endpoint de criação de tenant ainda — é administrativo).
- **`401 Unauthorized` em qualquer chamada:** o access token dura só 1h, mas o front-end tenta renovar sozinho via refresh token (`lib/api.ts`) antes de mostrar qualquer erro — se ainda assim aparecer, o refresh token (30 dias) também expirou/foi revogado, ou o usuário foi desligado (`JwtAuthGuard` reconsulta `Usuario.status` a cada requisição, US-003), ou não há sessão nenhuma salva (login primeiro, em `/login`).
- **`schema.prisma` com campo que não existe no banco real (ex.: `Usuario.fotoPerfilUrl`, achado em 2026-08-06):** alguém adicionou o campo em `schema.prisma` (e no tipo `Usuario` de `@crm/shared`) sem criar a migration correspondente — depois de `prisma generate`, qualquer query em `Usuario` (inclusive login) começa a tentar `SELECT` uma coluna inexistente e quebra a API inteira. Se acontecer de novo: rode `npx prisma migrate status` (ou compare `information_schema.columns` do Postgres com `schema.prisma`) antes de assumir que "regenerar o client" é seguro; a correção é sempre criar a migration faltante (`ALTER TABLE ... ADD COLUMN`), nunca reverter o campo do schema sem confirmar antes se ele já está em uso por outra parte do código.

## Próximos passos sugeridos

Fase 1 (Vendas) e Fase 2 (Locação) estão essencialmente completas — ver "O que já está implementado" e "Fase 2 — Locação operacional" acima. Auditoria de segurança (2026-08-08) confirmou que o escopo por `unidadeId` está aplicado de forma consistente em todo o funil (leads/imóveis/oportunidades/checklist/visitas/propostas/reservas/carteiras) e, depois de uma correção, também em todo o módulo de Locação. Os passos naturais agora são:

1. **US-103** (troca de proprietário, Locação) — deliberadamente adiada, só faz sentido quando houver necessidade real em produção.
2. **Fase 3 (Motor financeiro, `ART-008`)** — não pode começar de verdade sem `DEC-TEC-003` (escolha de provedor bancário): é dinheiro de terceiros, não dá pra tratar como hipótese técnica do jeito que fizemos em Locação.
3. **Retomar EPIC-08 (WhatsApp) e EPIC-10 (portal prioritário)** assim que as decisões comerciais pendentes (`DEC-TEC-006`, `DEC-NEG-019`) forem resolvidas.
4. **Deploy real e cobrança de clientes** (os dois bloqueadores P0 pra revenda) — esperando escolha de hospedagem e de provedor de pagamento SaaS.
5. **Validação jurídica formal de US-111** (multa rescisória) — só depois disso a variável `LOCACAO_MULTA_RESCISORIA_HABILITADA` deveria ser considerada para um ambiente real.

**Fechada (2026-08-09): pipeline de CI** (`.github/workflows/ci.yml`) — GitHub Actions rodando a MESMA sequência que já rodávamos manualmente a cada mudança nesta sessão (`npm run typecheck` → `npm run test` → `npm run build`, os três scripts unificados na raiz do monorepo), disparado em todo push e pull request pra `master`/`main`. **Decisão técnica registrada**: assume GitHub como host de código (nenhuma decisão formal sobre isso foi tomada — é só o default mais comum pra um time pequeno; troque o workflow se a escolha for outra). **Simplificação registrada**: só a suíte unitária (`npm test`, Prisma mockado, sem rede) roda em CI — `test:integration`/`test:e2e` (que batem no Supabase real) ficam de fora de propósito, porque conectar CI a um banco de verdade é uma decisão separada (qual banco usar só pra CI, isolado do de desenvolvimento) ainda não tomada. **Ainda não é deploy**: o workflow só valida o código — não publica nada em lugar nenhum, e só passa a rodar de fato quando este repositório for empurrado pra um remoto no GitHub (hoje é só local, sem `git remote` configurado). Validado localmente rodando a sequência exata três vezes (`npm run typecheck`/`npm run test`/`npm run build` a partir da raiz) — passou limpo, incluindo o build de produção do Next.js com as 24 rotas (`/locacao`, `/pessoas`, `/portal/[token]` inclusas).

**Fechada (2026-08-09): auditoria de dependências (`npm audit`)** — rodado contra dependências de produção (`--omit=dev`). Aplicado `npm audit fix` (não-destrutivo, sem bump de major) e revalidado (`typecheck` + suíte completa, 272/272 passando) — reduziu de 11 para 10 vulnerabilidades. **Restam 10 (6 moderadas, 4 altas) que só fecham com upgrade de major version**: Next.js 14.2.35 → 16.3.0 (várias advisories de SSRF/DoS/cache confusion em Server Actions/rewrites — nenhuma delas explorável hoje porque a aplicação não está publicada em lugar nenhum, P0 de deploy ainda pendente) e `@nestjs/platform-express` 10.4.22 → 11.1.28 (DoS em `qs`/`express`, mesma lógica de exposição zero pré-deploy). **Não aplicado**: `npm audit fix --force` faria dois saltos de major version simultâneos no framework web e no framework da API — risco/esforço grande demais pra decidir sozinho sob instrução genérica; fica registrado aqui como dívida técnica real, a ser resolvido antes do deploy real (item 4 da lista acima), não em paralelo com ele.

**Fechada (2026-08-09): validação de variáveis de ambiente na subida (`src/main.ts`)** — **extensão registrada**, não especificada em nenhum artefato: antes desta mudança, `DATABASE_URL`/`JWT_SECRET` ausentes ou inválidos só quebravam no primeiro uso real (primeira query, primeiro login) com erro genérico — mesmo tipo de armadilha silenciosa do achado real desta sessão com `Usuario.fotoPerfilUrl` (ver "Problemas reais já encontrados" acima). Agora `bootstrap()` valida e encerra o processo (`process.exit(1)`) com mensagem explícita antes de subir o Nest, se: `DATABASE_URL` ausente; `JWT_SECRET` ausente; `JWT_SECRET` igual ao placeholder literal de `.env.example`; ou `JWT_SECRET` com menos de 32 caracteres. **Testado de verdade** (processo real via `ts-node`, não só leitura de código): as quatro condições de erro imprimem a mensagem certa e encerram antes de qualquer log do Nest; com o `.env` real (segredo válido), a aplicação sobe normalmente (log `Nest application successfully started`), sem regressão.

**Fechada (2026-08-09): desligamento gracioso (`app.enableShutdownHooks()`, `src/main.ts`)** — **extensão registrada**, não especificada em nenhum artefato: sem esta chamada, os hooks `OnModuleDestroy` do Nest (inclusive `PrismaService.onModuleDestroy` → `$disconnect()`) nunca disparavam em `SIGTERM`/`SIGINT` — só em `app.close()` explícito (ex.: dentro de testes). Qualquer plataforma de hospedagem real (container, orquestrador) manda `SIGTERM` pra pedir desligamento gracioso antes de matar o processo; sem o hook registrado, o processo morria imediatamente, sem drenar requisições em andamento nem fechar a pool de conexões do Postgres. **Testado de verdade**: confirmado via instrumentação temporária (removida depois) que `app.close()` — o mesmo caminho que o Nest chama internamente ao receber `SIGTERM`/`SIGINT` com o hook ativo — de fato dispara `PrismaService.onModuleDestroy` e completa o `$disconnect()`. **Limitação de ambiente registrada**: tentei confirmar também via sinal de SO real (`kill -TERM`/`kill -INT` num processo Node rodando), mas o Git Bash neste Windows não entrega o sinal de forma confiável ao processo Node correto (PID reportado pelo shell não bate com o processo real) — Windows tampouco tem um `SIGTERM` capturável de verdade (vira kill forçado). A validação ficou no nível de `app.close()` (o mecanismo interno que o hook aciona), que é onde a lógica de negócio (desconectar o Prisma) realmente mora; o encaminhamento do sinal do SO em si é responsabilidade padrão do Nest/Node, não código escrito nesta sessão.

**Fechada (2026-08-09): `GET /health`** (`src/modules/health/`) — **extensão registrada**, não especificada em nenhum artefato: item básico de prontidão operacional (liveness/readiness) que praticamente toda plataforma de hospedagem exige (load balancer, orquestrador de container, monitoramento externo), independente de qual for escolhida (`DEC-TEC-002` continua em aberto). Roda `SELECT 1` contra o Postgres real (sem contexto de RLS — não toca tabela tenant-scoped nenhuma) e responde `503` se o banco estiver inacessível, em vez de um `200` mentiroso. `@Public()` (quem chama é a própria infraestrutura, nunca um usuário com sessão) e `@SkipThrottle()` (checagem de liveness roda a cada poucos segundos por definição — contar isso contra os 100 req/min por IP derrotaria o propósito; confirmado via curl que a resposta não carrega `X-RateLimit-*`, ao contrário de uma rota normal). Testado ponta a ponta contra o servidor real: `200` com banco de pé, headers de rate limit ausentes.
