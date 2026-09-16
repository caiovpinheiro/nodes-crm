# AGENT.md — histórico de decisões

Este arquivo registra decisões estruturais tomadas ao longo do desenvolvimento do pacote `n8n-nodes-eduit-crm`. Uma entrada por decisão, ordem cronológica, formato fixo.

---

### 2026-09-16 - Search Full Record com informações rastreadas

**Decisão**

`Search > Search Full Record` ganhou duas opções: `Include Tracked Info` (padrão **ligado**) envia `includeTracking=1` e o contato passa a trazer os 13 campos de atribuição (UTMs, gclid, fbclid, referrer, google_client_id, ttad) junto ao payload normal; `Only Tracked Info` reduz cada contato a `id`/`number`/`name` + grupo `tracking` e pula a busca de negócios. Versão bump para 0.5.2.

**Contexto**

A listagem `GET /api/contacts` nunca expôs os campos rastreados — eles existiam só para import/export/filtros. Relatórios de origem de lead no n8n precisavam de SQL direto.

**Alternativas descartadas**

Sempre incluir os campos no backend (13 colunas a mais por linha para a UI inteira). Resource novo só para tracking (duplica Search By/filtros; opção no mesmo node cobre o caso).

**Impacto**

Retrocompatível: backend antigo ignora o query param desconhecido e o node segue sem os campos. O backend correspondente está em `backend_crm1` (`includeTracking` opt-in em `GET /api/contacts`).

---

### 2026-08-27 - Timeline do deal como action (não Trigger)

**Decisão**

Novo resource `Timeline` no node de action (`Bwipo CRM`), operation `Get Events`. Recebe `Deal ID` + tipo de evento (os mesmos cartões da timeline do painel: responsável, mensagem, automação, status, estágio, …) e lê `GET /api/deals/:id/timeline`. Padrão: só o evento mais recente daquele tipo. Trigger permanece para iniciar o workflow.

O backend correspondente vai no patch `backend-deal-timeline-bearer.patch` (a rota hoje só aceita sessão). Este agente não tem push em `backend_crm1`.

**Contexto**

O Trigger entrega `dealId` quando o CRM dispara. O operador precisa, no meio do fluxo, puxar o cartão da timeline daquele negócio (autor, detalhe, horário) — não ouvir o webhook de novo.

**Alternativas descartadas**

- Transformar o Trigger em action. Evento ao vivo continua precisando de webhook.
- Endpoint novo de “get event by type”. A timeline já devolve `{ id, type, meta, createdAt, user }` e o filtro cabe no node (máx. 200).

**Impacto**

Pacote 0.5.0. Sem o patch no CRM a operation falha com 401. Token precisa de `deal:view`.

---

### 2026-08-27 - Rebrand visível: Eduit CRM → Bwipo CRM

**Decisão**

Só o que o operador vê no n8n muda: `displayName` dos nodes e da credencial passam a **Bwipo CRM** / **Bwipo CRM Trigger** / **Bwipo CRM API**. Ícone novo `bwipoCrm.png` (logo b em degradê). `name` interno (`eduitCrm`, `eduitCrmTrigger`, `eduitCrmApi`) e caminhos de arquivo ficam iguais para não quebrar workflows já salvos.

**Contexto**

Pedido de rebrand da marca no picker do n8n. Token continua no formato `eduit_...` (backend). Header `X-Eduit-Signature` também é contrato do CRM.

**Alternativas descartadas**

- Renomear classes/`name` dos nodes. Breaking change: todo workflow existente perderia o tipo.

**Impacto**

Pacote 0.4.1. Rebuild da imagem para o ícone e o nome aparecerem.

---

### 2026-08-26 - Trigger n8n por eventos do CRM (troca de responsável)

**Decisão**

Novo node `EduitCrmTrigger` (`group: trigger`). Ao ativar o workflow, registra a URL do n8n em `POST /api/integration-webhooks` com os eventos escolhidos. O CRM POSTa `{ event, occurredAt, organizationId, contactId, dealId, data }` quando `fireTrigger` dispara.

Evento padrão: `agent_changed` (troca de responsável do negócio). Também: `contact_owner_changed`, `lead_distributed`, `stage_changed`, `deal_created`, `deal_won`, `deal_lost`, `contact_created`, `tag_added`, `conversation_created`, `lifecycle_changed`, `message_received`, `message_sent`.

O backend correspondente vai no patch `backend-integration-webhooks.patch` (tabela `integration_webhooks`, dispatch em `fireTrigger`, `agent_changed` em `assignDealOwner`). Este agente não tem push em `backend_crm1`.

**Contexto**

O CRM só tinha automações internas. Não havia inscrição de webhook de saída. `agent_changed` só saía do `PUT /api/deals/:id` — bulk, distribuição e automação usam `assignDealOwner` sem `fireTrigger`.

**Alternativas descartadas**

- **Polling** no n8n. Atraso e carga. Evento de troca de responsável some entre ciclos.
- **Reusar `agent_changed` no contato.** Dispararia automações de deal. Evento novo `contact_owner_changed`.
- **Trigger só de `agent_changed`.** Os outros eventos já passam por `fireTrigger`; o mesmo registro serve.

**Impacto**

Pacote 0.4.0. Sem o patch no CRM o trigger não ativa (404). Token precisa de `deal:view` + `deal:edit`.

---

### 2026-08-25 - Deal > Update: Lost Reason do catálogo e marca como LOST

**Decisão**

Campo `Lost Reason` em `Deal > Update` passa a ser dropdown (`getLossReasons`) com os motivos de **Configurações → Motivos de perda**. O value é o label (é o que o CRM grava em `Deal.lostReason`).

Ao escolher um motivo, o node **não** faz só `PUT /api/deals` com a string: chama `PUT /api/deals/:id/status` `{ status: "LOST", lostReason }`, que roda `markDealLost` (status LOST, `closedAt`, move para o estágio Perdido). Sem isso o JSON até gravava `lostReason`, mas o card no kanban continuava `OPEN` e o motivo não aparecia.

**Contexto**

A lista vinha de `GET /api/analytics/losses` (só motivos já usados em deals LOST) e o campo era texto livre. A org tinha catálogo e o operador não via os motivos. Texto livre + status OPEN não preenche o campo de perda na UI.

**Alternativas descartadas**

- **Continuar texto livre.** O CRM valida o label contra o catálogo do funil (`assertLostReasonAllowed`). Texto inventado some na UI.
- **Só gravar `lostReason` sem mudar status.** É o que já falhou: o deal #18612 ficou `OPEN` com `lostReason` preenchido e o kanban não mostrou o motivo.

**Impacto**

Depende do backend aceitar Bearer em `GET /api/settings/loss-reasons` e `PUT /api/deals/:id/status`. Sem isso o dropdown cai no fallback de analytics e o mark-lost cai no `PUT /api/deals` com `status: LOST`.

---

### 2026-08-21 - Deal > Search: custom fields preenchidos

**Decisão**

`Deal > Search` anexa `customFields` em cada negócio, **só os que têm valor**. Usa `GET /api/deals/:id/custom-fields` (já Bearer). Se a listagem já vier com `customFields` (backend futuro), não refaz a chamada.

**Contexto**

O JSON do Search trazia `contact`/`stage`/`owner` e omitia os campos personalizados do negócio. `GET /api/deals` não inclui esses valores. Push no `backend_crm1` foi negado (403), então o node resolve com a rota que já existe.

**Alternativas descartadas**

- **Só mudar o backend (`getDeals`).** Correto a médio prazo, mas este agente não consegue push em `caiovpinheiro/backend_crm1`. Sem deploy do CRM o Search continuaria vazio.
- **Trazer todos os custom fields da org, inclusive vazios.** Pedido explícito: só o que está preenchido.

**Impacto**

Uma chamada extra por negócio retornado (padrão 20). Sem breaking change. Campo vazio não aparece no JSON.

---

### 2026-08-20 - Deal + Contact: Create Deal For Existing Contact

**Decisão**

Nova operation `Create Deal For Existing Contact` no resource `Deal + Contact`. Localiza o contato (ID → telefone → e-mail) e cria/reaproveita o negócio via `POST /api/leads`. **Não cria contato** se não achar — falha com erro claro.

Zero mudança no backend: `GET /api/contacts/:id`, `GET /api/contacts?phone|email` e `POST /api/leads` já existem e já aceitam Bearer.

**Contexto**

`Create Deal With Contact` faz lead-or-create: se o telefone/e-mail não existir, nasce um contato novo. Fluxos que já têm o contato (webhook, `Contact > Search`, item anterior) precisam atribuir um negócio **sem** risco de duplicar cadastro.

**Alternativas descartadas**

- **Só promover `Contact ID` em `Deal > Create`.** `POST /api/deals` não tem `reuseOpenDeal` nem custom fields inline; a resposta também não traz `{ contact, deal, dealCreated, dealReused }`.
- **Flag `requireExistingContact` em `POST /api/leads`.** Desnecessário: o node resolve o contato antes e só envia `{ contact: { id } }`. Sem o lookup prévio, o backend tentaria criar e falharia com "contact.name é obrigatório" — mensagem ruim.
- **Operation em `Deal` em vez de `Deal + Contact`.** O caso de uso é o mesmo resource (negócio vinculado a contato); manter as duas operations juntas evita um terceiro caminho na UI.

**Impacto**

- 2 arquivos de código (`DealContactDescription.ts`, `EduitCrm.node.ts`) + README/TESTING.
- Sem breaking change: `Create Deal With Contact` permanece o default.
- Backend intocado.

---

### 2026-08-13 - Pin da imagem n8n em 2.33.3 (não usar `latest`)

**Decisão**

`Dockerfile` passa de `FROM n8nio/n8n:latest` para `FROM n8nio/n8n:2.33.3`.

**Contexto**

O serviço no EasyPanel rebuilda a cada push na `main`. Com `latest`, o build de 13/ago puxou n8n 2.35.x (tag atualizada no mesmo dia) e a UI caiu em "Service is not reachable". A instância estável em produção era `n8n@2.33.3` (`/healthz` ok, release no HTML). O node Eduit CRM não foi a causa da queda — foi o upgrade implícito do n8n no rebuild.

**Alternativas descartadas**

- Continuar em `latest` e "só rebuildar com cuidado". Qualquer commit na main vira upgrade de n8n.
- Pular para 2.35.x de propósito. Sem teste de migração de DB/workflows; 2.35.2 estava como pre-release no GitHub no mesmo dia.

**Impacto**

Rebuilds seguintes instalam o node em cima da mesma major/minor que já rodava. Upgrade de n8n vira mudança explícita no Dockerfile.

---

### 2026-08-05 - Deal > Update: adicionar tags com dropdown do catálogo da org

**Decisão**

Campo `Tag Names or IDs` (`multiOptions`, `loadOptionsMethod: getTags`) dentro do bloco `Update Fields` de `Deal > Update`. Semântica **somente aditiva**: as tags escolhidas são somadas às que o negócio já tem, nada é removido.

Zero mudança no backend — as três rotas necessárias já existiam e já aceitavam Bearer token:

| Uso | Rota |
| --- | --- |
| Alimentar o dropdown | `GET /api/tags` (array puro `[{ id, name, color }]`) |
| Aplicar a tag | `POST /api/deals/:id/tags` body `{ tagId }` |

`tagIds` é removido do body antes do `PUT /api/deals/:id` porque tag não é coluna de `Deal`: a relação vive na junção `tags_on_deals` e tem rota dedicada. Mesmo tratamento dado ao toggle `includeDeals` em `Contact > Search`.

**Contexto**

Fluxos de qualificação no n8n precisam marcar o negócio (ex.: "Lead Quente", "Sem Perfil") depois de avaliar a resposta do cliente. Sem isso o operador tinha que taguear à mão no board.

`POST /api/deals/:id/tags` aceita uma tag por request e faz upsert em `TagOnDeal`, o que torna a chamada idempotente — reexecutar o workflow não duplica vínculo nem quebra. Por isso o handler percorre a seleção em série, sem precisar de tratamento de conflito.

**Alternativas descartadas**

- **Aceitar `tags` no body do `PUT /api/deals/:id`.** Exigiria mexer em `updateDeal` no backend para tratar connect/disconnect da junção, e criaria um segundo caminho para a mesma escrita (a rota `POST .../tags` já registra `TAG_ADDED` e dispara o trigger `tag_added`). Usar a rota existente mantém uma verdade só.
- **Semântica de substituição (as tags escolhidas passam a ser as únicas).** Descartada por decisão do usuário: o caso de uso é somar marcação, e substituir apagaria silenciosamente tags postas por operador ou por automação.
- **Campo de texto livre para criar tag por nome.** O backend suporta (`{ tagName, color }` cria se faltar, com role ADMIN/MANAGER), mas ficou fora por decisão do usuário — só o dropdown das tags existentes.
- **Tags em `Deal > Create`.** Fora do escopo pedido. `POST /api/deals` não aceita tags, exigiria uma segunda chamada pós-criação.

**Impacto**

- 4 arquivos do node: `GenericFunctions.ts` (novo `getTags`), `EduitCrm.node.ts` (registro do loadOptions + helper `addTagsToDeal` + extração de `tagIds` no update), `descriptions/DealDescription.ts` (campo novo), `README.md`.
- Backend intocado — funciona no deploy atual, sem esperar redeploy.
- Sem breaking change: quem não preencher o campo tem exatamente o comportamento anterior.
- Isolamento multi-tenant pelo token: `GET /api/tags` só devolve tags da org do token, e um `tagId` de outra org falha na junção.

---

### 2026-08-04 - Message: envio WhatsApp com lista interativa (até 10 opções)

**Decisão**

Nova operation `Send WhatsApp List (Interactive)` no resource `Message`. Cobre o cenário de 4-10 opções, que o `type: button` (limitado a 3) não atende. Bate em `POST /api/deals/:id/messages` com `kind: "list"`:

```json
{
  "kind": "list",
  "body": "Escolha um curso:",
  "button": "Ver cursos",
  "sectionTitle": "Graduação",
  "rows": [
    { "id": "curso_adm", "title": "Administração", "description": "4 anos" },
    { "id": "curso_eng", "title": "Engenharia" }
  ]
}
```

Backend expõe `sendInteractiveListToConversation` em `outbound-messaging.ts` e `metaClient.sendInteractiveList` em `lib/meta-whatsapp/client.ts` (não existia). Reuso 100% do padrão de `sendInteractiveButtonsToConversation` (reabrir ticket resolved, `requireChannelScope`, SSE, `afterOutboundSideEffects`).

**Contexto**

`type: button` da Cloud API é limitado a 3 reply buttons por hard-limit da Meta. Casos comuns do CRM (menu de cursos, horários, produtos) precisam de mais opções e a Meta oferece `type: list` como caminho oficial: 1 botão que abre um menu de até 10 rows.

O node do n8n mantém UX simples — aceita `rows` no top-level e cria uma única seção por trás (`sectionTitle` opcional). O backend também aceita `sections: [{ title, rows }]` no shape puro da Cloud API como escape hatch para integrações que precisem de múltiplas seções.

**Alternativas descartadas**

- **Fundir buttons + list numa operation única** (com `Menu Type` como discriminador). Descartado: os campos são bastante diferentes (button não tem `Description` nem `Button Label`, list não tem `Header` estruturalmente idêntico). Duas operations deixam o formulário mais limpo.
- **Permitir múltiplas seções direto no UI.** Descartado por complexidade: fixedCollection aninhada em fixedCollection é ruim de operar. Deixamos o `sections` só como escape via HTTP.
- **Reaproveitar `messageType: "list"` no Message.** Descartado: mantivemos `messageType: "interactive"` para list e buttons (com `content` diferenciado — `[Lista: ...]` vs `[Botões: ...]`). Reduz variantes na timeline.

**Impacto**

- Backend: 3 arquivos — `lib/meta-whatsapp/client.ts` (novo método `sendInteractiveList`), `services/outbound-messaging.ts` (+250 LOC), `app/api/deals/[id]/messages/route.ts` (+55 LOC com o branch `list` e o parser `parseRows`).
- Nodes: 2 arquivos — `MessageDescription.ts` (nova operation + campos), `EduitCrm.node.ts` (handler `sendList`).
- Sem breaking change. `sendInteractive` (buttons) segue igual.

---

### 2026-08-04 - Message: envio WhatsApp com botões interativos (reply buttons)

**Decisão**

Nova operation `Send WhatsApp with Buttons (Interactive)` no resource `Message`. Body/header/footer/buttons aceitam expressões n8n (texto variável vindo do workflow). Meta Cloud API é o único destino — Baileys/Messenger/Instagram são rejeitados no service.

Bate no mesmo `POST /api/deals/:id/messages` com `kind: "interactive"`, novo shape no body:

```json
{ "kind": "interactive", "body": "...", "buttons": [{"id":"opt_yes","title":"Sim"}], "header":"...", "footer":"..." }
```

**Contexto**

O uso deste tipo de mensagem hoje só existia dentro do `automation-executor` (step `send_whatsapp_interactive`). n8n é o canal natural para orquestrar botões dinâmicos vindos de sistemas externos (ex.: qualificar lead com "Sim/Não/Falar com atendente" após um webhook). Sem esta operation, o operador precisava criar uma automação inteira só para expor o botão.

**Alternativas descartadas**

- **List messages, CTA URL, media header.** Fora do escopo pedido pelo usuário ("Pode fazer isso e mais nada?"). Cobrir só reply buttons — o formato mais comum.
- **Node autônomo `WhatsApp Interactive`.** Manter dentro de `Message` mantém a UX consistente com `sendText/sendTemplate` (mesmo `Deal ID`, mesmo bloco `Options`).
- **Aceitar 4+ botões e o servidor cortar em 3.** Rejeitar com 400 no service é mais claro que enviar mensagem incompleta silenciosamente. O n8n também valida antes do HTTP.

**Impacto**

- Backend: 2 arquivos (`src/services/outbound-messaging.ts` +200 LOC com `sendInteractiveButtonsToConversation`; `src/app/api/deals/[id]/messages/route.ts` +40 LOC com o branch `interactive` e o parser `parseButtons`).
- Nodes: 2 arquivos (`MessageDescription.ts` +65 LOC com a operation nova e seus campos; `EduitCrm.node.ts` +50 LOC com o handler).
- Formato do `content` gravado na `Message` (`"body\n[Botões: t1, t2, t3]"`) é idêntico ao já usado por `automation-executor` — timeline unificada.
- Isolamento por org: mantido via `authenticateApiRequest` + `runWithApiUserContext` já existentes na rota.

---

### 2026-08-03 - Resource `Message`: envio pelo deal com template, modelo interno e flow

**Decisão**

Novo resource `Message` com três operations, todas partindo de um **Deal ID**:

1. `Send Internal Note` — nota interna (inbox + aba Notas do deal).
2. `Send WhatsApp Message` — texto livre, com conteúdo manual, de modelo interno ou de resposta rápida.
3. `Send WhatsApp Template` — template aprovado da WABA, com preview e variáveis por seleção, incluindo templates com botão Flow.

Tudo bate em `POST /api/deals/:id/messages`, endpoint agregador criado no backend nesta mesma data. O node não resolve conversa nem monta JSON da Meta: envia `dealId` + `kind` + campos amigáveis, e o servidor faz o resto.

Sete `loadOptions` novos alimentam os dropdowns: templates aprovados, variáveis do template selecionado, modelos internos, respostas rápidas, variáveis do conteúdo interno, flows e campos das telas do flow.

**Contexto**

A entrada de 2026-07-30 registrava o resource `Message` como fora do v1 por falta de endpoint Bearer: enviar exigia `conversationId` e criar conversa dependia de sessão NextAuth. O backend resolveu isso resolvendo a conversa server-side a partir do deal.

**Alternativas descartadas**

- **Preview do template em campo próprio no node.** A UI de node do n8n não tem campo reativo a outro parâmetro — um `notice` é estático. Optamos por colocar cabeçalho, corpo e botões na `description` de cada opção do dropdown, que o n8n renderiza na própria lista no momento da escolha.
- **`Deal ID` como dropdown.** Descartado: listar todos os negócios da organização não escala e o caso de uso real recebe o `dealId` do webhook ou de um node `Deal > Search` anterior.
- **Buscar o corpo do template em runtime para renderizar o texto da timeline.** Descartado: `GET /whatsapp-template-configs/approved` pagina a Graph inteira e seria chamado uma vez por item processado. O backend passou a resolver corpo e idioma sozinho, então em runtime o node envia só o nome do template e as variáveis.
- **Campo único de `flow_action_data` em JSON.** Descartado pelo requisito de seleção: o dropdown de flows libera a lista de campos das telas daquele flow, e as chaves viram opções.

**Impacto**

- 3 arquivos do node alterados (`EduitCrm.node.ts`, `GenericFunctions.ts`, `descriptions/index.ts`) e 1 criado (`descriptions/MessageDescription.ts`). Zero breaking change — nenhum resource existente foi tocado.
- Depende do deploy do backend de 03/ago/26. Sem ele, os dropdowns ficam vazios e o envio retorna `404`.
- Isolamento multi-tenant continua garantido pelo token: a org sai do `ApiToken`, e um `dealId` de outra organização retorna 404.

---

### 2026-07-30 - Nodes v0.2: Search by Ad Source ID + Note on Deal

**Decisão**
Adicionar dois novos nodes ao pacote:
1. Filtro `Ad Source ID (Meta CTWA)` em `Contact > Search` (com toggle opcional `Include Deals`) **e** em `Search > Search Full Record` como novo `Search By`.
2. Novo resource `Note` com operation `Create on Deal` — bate em `POST /api/deals/:id/notes`.

Ambos dependem de mudanças no backend (`Mikyxx1234/backend_crm1`), entregues em `backend-n8n-nodes-v2.patch` (na raiz deste repo):
- `GET /api/contacts` aceita query param `adSourceId` (match exato em `Contact.adSourceId`).
- `POST /api/deals/:id/notes` passa a aceitar **Bearer token** (via `authenticateApiRequest` + `runWithApiUserContext`) e, além do `Note` (que já existia), cria também uma `Message` `messageType="note", isPrivate=true` na conversa mais recente do contato do deal — assim a nota aparece **tanto em `/pipeline` (aba Notas do deal) quanto em `/inbox` (timeline)**. Emite `sseBus.publish("new_message", ...)` pra atualização em tempo real.

**Contexto**
O usuário precisa disparar dois fluxos comuns via n8n:
- Enumerar contatos originados por um anúncio Meta específico (`adSourceId` é o id do post/ad no referral).
- Registrar notas em deals a partir de webhooks/automation, com visibilidade nos dois lugares onde o operador consome contexto (chat do inbox e painel do deal).

**Alternativas descartadas**
- **`POST /api/conversations/:id/messages`** com `messageType: "note"` (endpoint que já espelhava nota em `Note`+`Message`): descartado porque exige `conversationId`, que hoje o token Bearer não consegue resolver a partir de contato/deal (o endpoint `POST /api/conversations/create` só aceita sessão). Passar por deal é mais idiomático pro caso de uso (n8n recebe `dealId` do webhook do CRM).
- **Endpoint novo `POST /api/deals/:id/conversation-note`**: descartado por gerar dois caminhos convivendo (o antigo `POST /api/deals/:id/notes` continuaria só criando `Note`). Preferimos evoluir o endpoint existente — o comportamento anterior é preservado quando o contato não tem conversa.
- **Novo resource inteiro pra "Search by Ad Source ID"**: descartado. Reutilizamos os handlers de `contact:search` e `search:fullRecord` — adicionar filtro é menos ruído no dropdown de operações.

**Impacto**
- Backend: 3 arquivos alterados (`src/services/contacts.ts`, `src/app/api/contacts/route.ts`, `src/app/api/deals/[id]/notes/route.ts`). Comportamento do frontend preservado (a rota de notas do deal continua funcionando com session — `authenticateApiRequest` faz fallback pra `auth()` quando não há Bearer).
- Nodes: 5 arquivos alterados/criados. Zero breaking change (nada removido; só adições).
- Isolamento multi-tenant: garantido pela `Prisma Extension` já existente — `runWithApiUserContext` ativa o `RequestContext` com `organizationId` do token, e todas as queries em `contact/deal/note/message/conversation` passam a filtrar por essa org automaticamente. Um token de uma org que tente acessar `dealId` de outra recebe 404.
