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
- **`SchedulerService`** (`sistema/apps/api/src/modules/scheduler/`, `@nestjs/schedule`): job real (cron a cada 5 min, `CronExpression.EVERY_5_MINUTES`) que substitui os agendadores "preguiçosos" (README, "Próximos passos sugeridos" anterior) — varre todos os tenants `ATIVO` e roda, dentro do contexto RLS de cada um (`TenantPrismaService.run`), a mesma lógica de negócio já usada pela checagem embutida em cada request (reabertura de lead por SLA, marcação de inatividade, expiração de reserva, escalonamento de transferência de carteira) — os dois gatilhos reaproveitam o mesmo método (`executarVarreduraAutomaticaTx` em cada service), nunca duplicam regra. Falha num tenant não trava os demais (try/catch por tenant, logado). Para enumerar tenants, o role da aplicação (`crm_app`) ganhou uma política de leitura em `tenant` (só `SELECT`, nunca escrita — ver migration `rls_tenant_leitura_app`), já que nenhum outro caminho de código precisava disso antes. Testado ponta a ponta contra o banco real: varredura manual processou lead com SLA vencido (reabriu e redistribuiu), reserva vencida (expirou) e transferência de carteira vencida (escalou), cada uma com `RegistroDeAuditoria` de ator sistema.

- **Redesenho visual e reconciliação do menu lateral (2026-08-02)**: `globals.css`, `app-shell.tsx` e `app/page.tsx` (dashboard) foram substituídos por um novo tema visual (dark, estilo SaaS) com um menu de 14 itens — a troca trouxe um dashboard inicial (`/`) totalmente mockado (dados fixos, sem chamada real à API) e um menu com mais entradas do que telas reais existiam (7 telas reais para 14 itens de menu, com duplicação/rotas mal mapeadas). Reconciliado construindo as seções que faltavam como telas reais (não mocks): `/funil` (funil de 5 etapas, reaproveita `GET /indicadores`), `/marketing` (leads por canal — novo campo `leadsPorCanal` em `IndicadoresService.obter`), `/financeiro` (VGV fechado + contagem de comissão cruzada acionada — novos campos `vgvFechado`/`comissoesCruzadasQuantidade`, mesmo serviço), `/propostas` e `/contratos` (visão cruzada por unidade, fora do escopo de uma oportunidade específica — novos métodos `listarTodas` em `PropostasService`/`VisitasService`, endpoints `GET /propostas` e `GET /visitas` sem `oportunidadeId`), `/relatorios` (hub simples linkando as telas acima). `app/page.tsx` (dashboard mockado) foi mantido como está — não é uma tela real ainda, decisão explícita do usuário de trabalhar em cima do novo visual em vez de reverter.
- **Tarefas e Configurações (EXTENSÕES REGISTRADAS, 2026-08-02)**: as duas últimas entradas do menu não correspondiam a nenhum artefato formal (`ART-004`/`ART-005`/`ART-009`) nem a uma US numerada do backlog — o escopo veio de decisão direta do usuário deste sistema, não de um requisito documentado. **Tarefas** (`sistema/apps/api/src/modules/tarefas/`, tela `/tarefas`): lembrete/follow-up manual e pessoal do usuário logado (título, prazo opcional, concluída/pendente) — sem vínculo com Lead/Oportunidade/etc. e sem atribuição a outro usuário (sempre dono = quem criou); por não ser uma entidade de `ART-005`, escritas aqui não geram `RegistroDeAuditoria`. **Configurações** (`GET /usuarios/me`, `PATCH /usuarios/me/senha`, tela `/configuracoes`): dados da própria conta (nome/e-mail/perfil) e troca de senha exigindo confirmação da senha atual — deliberadamente não toca dados de unidade/tenant (isso já tem tela própria em Unidades). O item de menu "Configurações" deixou de apontar para `/auditoria` (agora só acessível via link dentro da própria tela de Configurações, "Ver log de auditoria da unidade").

EPIC-08 (WhatsApp) e EPIC-10 (portal prioritário) estão adiados — ambos dependem de decisões comerciais ainda pendentes (fornecedor/BSP em `DEC-TEC-006`; escolha do portal em `DEC-NEG-019`). Com EPIC-11 completo, todos os épicos da Fase 1 sem dependência comercial pendente estão implementados.

## Fase 2 — Locação operacional (iniciada, 2026-08-02)

Backlog completo em `../crm-imobiliario-projeto/artefatos/ART-015-backlog-fase-2.md` (US-101 a
US-114, derivadas de `ART-010-locacao-operacional.md`). Nesta primeira fatia, só as duas histórias
fundacionais foram implementadas — tudo o mais (garantia, vistoria, ativação do contrato, reajuste,
renovação, encerramento antecipado com multa, documentos, portal) depende de decisões de negócio
ainda pendentes (`DEC-NEG-014` a `017`) e/ou de entidades que só existirão em rodadas seguintes.

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
- Tela `/locacao`: cadastro de administração/locação + seção de garantias por contrato
  (registrar/ativar/trocar), ainda sem transição de estado do próprio contrato.

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

## Próximos passos sugeridos

Todo o backlog da Fase 1 sem dependência comercial pendente (EPIC-01 a EPIC-07, EPIC-09, EPIC-11) está implementado, incluindo autenticação real (US-002/US-003), a trilha de auditoria (`RegistroDeAuditoria`) cobrindo todos os pontos obrigatórios de ART-005 §9 que existem nesta fatia — com ator sistema para eventos automáticos —, a correção de identidade (todo endpoint deriva o ator do JWT, nunca de um `usuarioId` enviado pelo cliente), a restrição por `perfil`/`unidadeId`/responsável em listagens de topo e sub-recursos aninhados do funil, um teste de integração real (não mockado) provando o isolamento por Row-Level Security entre tenants, e um agendador real (`SchedulerService`) substituindo as checagens "preguiçosas". Os passos naturais agora são:

1. Continuar a Fase 2 (Locação operacional) pelo backlog em `ART-015-backlog-fase-2.md` — próxima história natural: US-106 (vistoria de entrada + primeira transição de estado real do contrato, agora que Garantia já existe para viabilizar o gate de RN-402).
2. Concluir a rodada de design com alguém olhando de verdade no navegador (espaçamento, densidade, hierarquia visual) — a parte defensável só por código (foco/hover/disabled, acessibilidade de formulário, tokens de tipografia) já foi fechada, ver "Transversal" acima.
3. Retomar EPIC-08 (WhatsApp) e EPIC-10 (portal prioritário) assim que as decisões comerciais pendentes (`DEC-TEC-006`, `DEC-NEG-019`) forem resolvidas.
