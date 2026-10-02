# n8n-nodes-eduit-crm

Node privado do n8n para operar o **Bwipo CRM** com campos amigáveis (sem montar JSON manual). Consome a API do CRM via token Bearer. Inclui um **Trigger** por eventos (troca de responsável, estágio, deal criado/ganho/perdido, …), que depende do patch `backend-integration-webhooks.patch` no CRM.

## Recursos e operações

- **Bwipo CRM Trigger** (novo) — inicia o workflow quando o CRM dispara um evento. Padrão: **troca de responsável do negócio** (`agent_changed`). Também: responsável do contato, lead distribuído, estágio, deal criado/ganho/perdido, contato criado, tag, conversa, ciclo de vida, mensagem recebida/enviada. **Requer** `backend-integration-webhooks.patch` aplicado e deployado em `caiovpinheiro/backend_crm1`.
- **Timeline**
  - `Get Events` — lê a timeline do negócio (a mesma do painel do deal) via `GET /api/deals/:id/timeline` e filtra pelo tipo (responsável alterado, mensagem recebida, automação, status, estágio, …). Padrão: só o evento mais recente daquele tipo. Use o `Deal ID` que veio do Trigger. **Requer** `backend-deal-timeline-bearer.patch` no CRM.
- **Deal + Contact**
  - `Create Deal With Contact` (prioridade) — acha o contato (ID → telefone → e-mail) ou cria, e cria o negócio já vinculado. Usa `POST /api/leads` (atômico e idempotente por telefone/e-mail). A coleção **Tracked Info** grava a informação rastreada do contato (UTM, click IDs e Meta/CTWA). Cada campo é opcional; vazio não é enviado.
  - `Create Deal For Existing Contact` — cria (ou reaproveita) um negócio para um contato **que já existe**. Localiza por ID → telefone → e-mail e **não cria contato** se não achar. Também usa `POST /api/leads` e aceita a mesma coleção **Tracked Info**.
- **Contact**
  - `Search` — `GET /api/contacts` (termo, e-mail exato, telefone exato, lifecycle, **Ad Source ID Meta CTWA**). Toggle `Include Deals` enriquece cada contato com `deals: [...]` (chamada extra `GET /api/deals?contactId=...`).
  - `Create` — `POST /api/contacts`.
  - `Update` — `PUT /api/contacts/:id`.
- **Deal**
  - `Search` — `GET /api/deals` (pipeline, stage, status, dono, contato). Cada negócio inclui `customFields` **somente com valor preenchido** (`[{ fieldId, name, label, type, value }]`), via `GET /api/deals/:id/custom-fields`.
  - `Create` — `POST /api/deals`.
  - `Update` — `PUT /api/deals/:id`. O campo **Lost Reason** é um dropdown do catálogo da org (`GET /api/settings/loss-reasons`). Ao escolher um motivo, o node marca o negócio como perdido (`PUT /api/deals/:id/status` → status `LOST` + `closedAt` + estágio Perdido). **Requer o backend com Bearer nessas duas rotas** — aplique `backend-deal-lost-reason-bearer.patch` em `caiovpinheiro/backend_crm1` e faça o deploy. Sem isso o dropdown fica vazio (ou só mostra motivos já usados) e o motivo não aparece no kanban. O campo `Tag Names or IDs` adiciona tags via `POST /api/deals/:id/tags`; as tags que o negócio já tinha são **preservadas**.
  - `Move Stage` — `PUT /api/deals/:id` com `stageId` (não usa `/api/deals/:id/move`, que depende de sessão).
- **Message** — envio pelo negócio, tudo por seleção (ver [Enviar mensagem pelo deal](#enviar-mensagem-pelo-deal))
  - `Send Internal Note` — nota interna: aparece na timeline do `/inbox` e na aba "Notas" do deal. O cliente não recebe nada.
  - `Send WhatsApp Message` — texto livre pelo WhatsApp do contato. O conteúdo pode ser digitado, vir de um **modelo interno** ou de uma **resposta rápida**, com as variáveis preenchidas por dropdown.
  - `Send WhatsApp Template` — template aprovado da WABA, com preview e variáveis por seleção. Funciona fora da janela de 24h e suporta templates com botão **Flow**.
  - `Send WhatsApp with Buttons (Interactive)` — mensagem com 1 a 3 botões de resposta rápida (Meta Cloud API). Body/header/footer/titles aceitam expressões n8n; o `ID` do botão vira o payload que chega no webhook quando o cliente clica. **Exige janela de 24h aberta** — fora dela, use template com botões pré-aprovado.
  - `Send WhatsApp List (Interactive)` — menu com até 10 opções (Meta Cloud API). Aparece como um botão único (rótulo configurável) que abre uma lista rolável; cada opção tem `Title`, `Description` opcional e `ID` (payload). Use quando precisar de mais de 3 opções — 3 é o limite hard de `type: button`. **Exige janela de 24h aberta.**
- **Note**
  - `Create on Deal` — `POST /api/deals/:id/notes`. Cria uma nota vinculada ao negócio; a mesma nota aparece **tanto na aba "Notas" do deal em `/pipeline` quanto na timeline do `/inbox`** (como nota interna) se o contato do deal tiver conversa vigente. Requer o ajuste do backend que fez esta rota aceitar Bearer token e espelhar a nota como `Message` privada.
- **Search**
  - `Search Full Record` — busca contatos e os negócios de cada um; retorna todos os resultados + `mainContact`/`mainDeal`. Aceita `Search By`: General Term, Email, Phone ou **Ad Source ID (Meta CTWA)**. Opções: `Include Tracked Info` (padrão ligado — UTM/gclid/fbclid/referrer no contato) e `Only Tracked Info` (retorna só id/nome + grupo `tracking`, sem buscar negócios). Requer backend com `includeTracking=1` em `GET /api/contacts`.

## Credencial: `Bwipo CRM API`

| Campo       | Descrição                                                        |
| ----------- | ---------------------------------------------------------------- |
| `Base URL`  | URL base do CRM, sem barra final. Ex.: `https://api.seu-crm.com` |
| `API Token` | Token gerado no CRM (formato `eduit_...`).                       |

- A organização é resolvida automaticamente a partir do token — não é preciso informar `organizationId`.
- O token vai sempre no header `Authorization: Bearer <token>` (nunca como campo do node).
- Gere o token no CRM em **Configurações > API Tokens**.

## Pré-requisitos de permissão

O usuário dono do token precisa das permissões:

- `contact:create`, `contact:edit`
- `deal:create`, `deal:edit`, `deal:view`, `deal:change_stage` (e escopo do stage)
- Para o **Trigger**: `deal:view` (listar webhooks) e `deal:edit` (registrar/remover a URL do n8n)
- Para o resource **Message**: escopo de envio (`channel.send`) no canal WhatsApp usado. Para listar flows, o dono do token precisa ser **ADMIN** ou **MANAGER** — sem isso só o dropdown de flows fica vazio, o resto do node funciona normalmente.

Sem elas, a API retorna `403`.

## Instalação

### Opção 1 — Local (desenvolvimento/teste)

```bash
cd "C:\Users\Caio\crm v3\n8n-nodes-eduit-crm"
npm install
npm run build
```

Carregue no n8n local apontando a pasta de extensões customizadas:

```bash
# Windows PowerShell
$env:N8N_CUSTOM_EXTENSIONS="C:\Users\Caio\crm v3\n8n-nodes-eduit-crm"
n8n start
```

Ou via `npm link` (linka o pacote no diretório `~/.n8n/custom`):

```bash
npm link
# em ~/.n8n/custom (crie se não existir):
npm link n8n-nodes-eduit-crm
```

### Opção 2 — Imagem Docker custom do n8n (Easypanel) — recomendado

Este repositório **não é uma aplicação independente**: ele gera uma imagem Docker baseada em `n8nio/n8n:2.33.3` (pinada) com o node já instalado. O `Dockerfile` na raiz:

1. Compila o pacote (`npm ci` + `npm run build`).
2. Empacota com `npm pack` (gera `n8n-nodes-eduit-crm-<versão>.tgz`).
3. Parte de `FROM n8nio/n8n:2.33.3` (versão pinada — **não** usar `latest`).
4. Instala o `.tgz` em `/opt/n8n/custom`.
5. Define `N8N_CUSTOM_EXTENSIONS=/opt/n8n/custom`.

#### Build local

```bash
docker build -t n8n-eduit-crm .
# rodar localmente (exemplo):
docker run -it --rm -p 5678:5678 \
  -e N8N_ENCRYPTION_KEY="<a mesma chave do seu n8n atual>" \
  n8n-eduit-crm
```

#### Deploy no Easypanel

1. Crie um serviço/app no Easypanel usando **GitHub**.
2. Selecione o repositório `Mikyxx1234/nodes-crm`.
3. Selecione a branch `main`.
4. Use o **Dockerfile da raiz** (build por Dockerfile, não Nixpacks/Buildpacks).
5. **Mantenha as mesmas variáveis de ambiente do n8n atual** (host, webhook URL, DB, etc.).
6. **Mantenha os mesmos volumes e o mesmo banco** do n8n atual (para não perder workflows/credenciais).
7. **Imprescindível: mantenha a mesma `N8N_ENCRYPTION_KEY`** — sem ela, as credenciais existentes ficam ilegíveis.

> As variáveis `N8N_CUSTOM_EXTENSIONS`, `N8N_COMMUNITY_PACKAGES_ENABLED` e `N8N_UNVERIFIED_PACKAGES_ENABLED` já vêm definidas na imagem pelo Dockerfile; não precisa duplicar (mas se já existirem no serviço, não conflitam).

#### Validação pós-deploy

1. Abra o n8n.
2. Em um workflow, adicione um node e procure por **Bwipo CRM**.
3. Crie a credencial **Bwipo CRM API** (`Base URL` + `API Token`) e clique em **Test** (deve passar — chama `GET /api/contacts?perPage=1`).
4. Teste **Contact > Search** (busca simples).
5. Teste **Deal + Contact > Create Deal With Contact** (cria contato + negócio).
6. Procure também por **Bwipo CRM Trigger** (ícone iguais). Sem o patch de webhooks no CRM, ativar um workflow com esse node falha.

> Atualizou o node? Faça commit/push na branch `main` e rebuild do serviço no Easypanel — a imagem recompila o pacote do zero.

## Trigger (eventos do CRM)

O node **Bwipo CRM Trigger** registra a URL do n8n em `POST /api/integration-webhooks` ao ativar o workflow. O CRM POSTa o evento em seguida.

**Evento padrão:** `agent_changed` (troca de responsável do negócio). Cobre edição do deal, bulk, distribuição inteligente e passo de automação `assign_owner` — depois do patch, esses caminhos passam por `assignDealOwner` + `fireTrigger`.

**Outros eventos úteis:** `contact_owner_changed`, `lead_distributed`, `stage_changed`, `deal_created`, `deal_won`, `deal_lost`, `contact_created`, `tag_added`, `conversation_created`, `lifecycle_changed`. `message_received` / `message_sent` existem mas são alto volume.

Payload de exemplo (`agent_changed`):

```json
{
  "event": "agent_changed",
  "occurredAt": "2026-08-26T15:00:00.000Z",
  "organizationId": "org_…",
  "contactId": "c_…",
  "dealId": "d_…",
  "data": { "fromOwnerId": "u_…", "toOwnerId": "u_…" }
}
```

Header opcional: `X-Eduit-Signature: sha256=…` (HMAC do body com o secret gerado no cadastro).

Sem o patch no CRM, ativar o workflow falha (404 em `/api/integration-webhooks`).

## Timeline (action)

Depois que o Trigger (ou outro passo) já tem o `Deal ID`, o resource **Timeline > Get Events** lê a mesma timeline do painel do negócio e filtra pelo tipo (responsável alterado, mensagem recebida, automação, status, estágio, …).

Fluxo típico: Trigger → **Bwipo CRM** (`Timeline` / `Get Events`) com `Deal ID` = `{{$json.dealId}}`.

Padrão: só o evento **mais recente** daquele tipo (`found`, `type`, `meta`, `user`, `createdAt`). Marque **Return All Matching** para um item n8n por ocorrência.

**Requer** `backend-deal-timeline-bearer.patch` aplicado no CRM. Sem isso a chamada falha com 401 (a rota só aceitava sessão).

## UX dos campos

- **Pipeline** e **Stage** são dropdowns (carregados de `GET /api/pipelines`). O **Stage** depende do Pipeline selecionado. Se a dependência dinâmica não carregar no seu n8n, escolha **Stage Source = Enter Stage ID Manually** e informe o `stageId`.
- **Status** e **Lifecycle Stage** são listas fixas com os valores reais do backend (`OPEN/WON/LOST` e `SUBSCRIBER/LEAD/MQL/SQL/OPPORTUNITY/CUSTOMER/EVANGELIST/OTHER`).
- **Owner ID / Assigned To ID / Contact ID / Company ID** são campos de texto (ID).

## Campos personalizados (Custom Fields)

O node suporta campos personalizados (custom fields) da organização em:

- **Contact > Create / Update** — bloco **Custom Fields**.
- **Deal > Create / Update** — bloco **Custom Fields**.
- **Deal + Contact > Create Deal With Contact** — blocos **Contact Custom Fields** e **Deal Custom Fields**.

Cada entrada tem um **dropdown com a lista de campos** (carregada de `GET /api/custom-fields`) e um **Value**. Em `Create`, o node primeiro cria o registro e depois grava os custom fields; em `Update`, grava direto. No `Create Deal With Contact`, os valores vão inline no `POST /api/leads`.

## Reprocessamento (Deal + Contact)

A mesma pessoa chega ao node mais de uma vez com frequência: item duplicado na lista de origem, retry, dois ramos que terminam no mesmo node, reexecução manual. Duas opções cuidam disso e **vêm ligadas por padrão**:

- **Avoid Duplicate Deal** — se o contato já tem negócio aberto no mesmo pipeline, o node reaproveita esse negócio em vez de criar outro cartão. Os campos personalizados continuam sendo gravados nele. A saída traz `dealReused: true` quando isso acontece. Vale nas duas operations de Deal + Contact.
- **Only Fill Empty Contact Fields** — só em `Create Deal With Contact`. Em contato que já existe, o node só escreve nos campos hoje vazios. Um telefone ou nome já correto não é substituído por uma execução posterior que trouxe dado antigo. `Lead Score` fica de fora dessa regra (é numérico, `0` é valor válido). `Create Deal For Existing Contact` não atualiza o cadastro do contato.

Desligue as duas se você realmente precisa criar vários negócios para o mesmo contato no mesmo pipeline, ou sobrescrever o cadastro a cada execução.

Endpoints usados:

- `GET /api/custom-fields?entity=contact|deal` — lista as definições para o dropdown (aceita Bearer).
- `PUT /api/contacts/:id/custom-fields` e `PUT /api/deals/:id/custom-fields` — gravam os valores (`{ values: [{ fieldId, value }] }`).

> O dropdown depende do backend com o ajuste que faz `GET /api/custom-fields` aceitar Bearer token. Se o seu backend ainda não tem esse ajuste, o dropdown fica vazio (faça o deploy do backend atualizado).

## Enviar mensagem pelo deal

O resource **Message** precisa apenas do **Deal ID**. O CRM resolve o contato, reusa o atendimento em aberto e, se não houver nenhum, abre um novo no canal WhatsApp padrão da organização — a mesma regra que as automações internas usam. Não é preciso descobrir `conversationId` nem criar conversa antes.

Todo o envio passa por `POST /api/deals/:id/messages`, que aplica as mesmas regras de uma mensagem enviada por um operador no inbox: escopo de canal, reabertura de ticket encerrado como um novo, atualização em tempo real do inbox e registro no log de atividades.

### Conteúdo: manual, modelo interno ou resposta rápida

Em `Send Internal Note` e `Send WhatsApp Message`, o campo **Content Source** define a origem do texto:

| Origem              | O que faz                                                                             |
| ------------------- | ------------------------------------------------------------------------------------- |
| `Manual Text`       | Texto digitado direto no node.                                                          |
| `Internal Template` | Modelo cadastrado em **Configurações → Modelos** (`GET /api/templates`).                |
| `Quick Reply`       | Resposta rápida da org, a mesma do atalho `/` no inbox (`GET /api/quick-replies`).      |

Ao escolher um modelo ou resposta rápida, o texto aparece na **descrição de cada opção do dropdown** e o bloco **Content Variables** lista automaticamente os `{{...}}` encontrados nele. A substituição acontece no node — o CRM recebe o texto final. Se quiser reescrever o texto mantendo a seleção como referência, use **Options → Text Override**.

### Templates da Meta

O dropdown **Template** lista os templates **aprovados** da WABA da organização (`GET /api/whatsapp-template-configs/approved`). A descrição de cada opção traz o cabeçalho, o corpo e os botões — é o preview do que será enviado, já que a UI de node do n8n não tem campo de preview reativo.

O bloco **Template Variables** carrega só os placeholders que existem no template escolhido, identificados por componente:

```
Cabeçalho — {{1}}
Corpo — {{nome}}
Botão "Ver oferta" — {{1}}
```

O node envia `[{ component, key, value }]` e **o backend monta o `components` da Cloud API**. Placeholders posicionais (`{{1}}`) e nomeados (`{{nome}}`) são tratados automaticamente — nunca se escreve JSON da Meta no node.

Idioma e corpo do template são resolvidos pelo servidor, então **Language Code** só é necessário quando o mesmo template existe em vários idiomas e você quer forçar um.

### Flows

Templates com botão **Flow** aceitam dados iniciais no formulário. Selecione o flow em **Flow** (`GET /api/whatsapp-flow-definitions`) e o bloco **Flow Initial Data** passa a listar os campos das telas daquele flow, para montar o `flow_action_data` por seleção. O **Flow Token** fica em `Options` e, vazio, é gerado pelo CRM a cada envio — que é o recomendado.

### Automações em andamento

Enviar texto encerra as automações ativas do contato, exatamente como a resposta de um operador no inbox — sem isso um salesbot em andamento continuaria mandando mensagens sobrepostas ao envio do workflow. Se o seu fluxo do n8n roda em paralelo a uma automação do CRM e você quer manter as duas, marque **Options → Keep Running Automations**. Notas internas e templates não interferem nas automações.

### Requisitos de backend

Este resource depende do backend com as rotas de 03/ago/26:

- `POST /api/deals/:id/messages` — envio agregado por negócio (Bearer).
- `GET /api/whatsapp-template-configs/approved`, `GET /api/templates`, `GET /api/quick-replies`, `GET /api/whatsapp-flow-definitions` e `GET /api/whatsapp-flow-definitions/:id` — passaram a aceitar Bearer para alimentar os dropdowns.

Sem esse deploy, os dropdowns ficam vazios e o envio retorna `404`.

## Limitações conhecidas / pendências

- **Owner (responsável) por dropdown:** indisponível nesta versão porque `GET /api/users` só aceita sessão NextAuth (não aceita token Bearer). Use o **Owner ID** manual. Quando existir um endpoint de usuários compatível com token, um dropdown será adicionado.
- **`Send WhatsApp Message` exige janela de 24h aberta.** Fora dela a Meta rejeita texto livre — use `Send WhatsApp Template`.
- **Templates não funcionam em canais WhatsApp QR (Baileys).** O envio retorna `400` orientando usar texto.
- **Deal ID é campo de texto**, não dropdown: listar todos os negócios da org não escala. Use a saída de `Deal > Search` ou `Search > Search Full Record` para obter o ID.
- **`Note > Create on Deal`** só espelha a nota como `Message` no `/inbox` se o contato do deal tiver **alguma conversa vigente** (mais recente por `updatedAt`). Se o contato nunca teve conversa, a nota aparece só na aba "Notas" do deal em `/pipeline` (comportamento igual ao painel manual do deal). O `Message > Send Internal Note` é mais completo: abre a conversa quando possível e só cai nesse comportamento se o contato não tiver telefone ou a org não tiver canal conectado.

## Atualização em Update (preservação de campos)

Em `Update Contact` e `Update Deal`, o node só envia campos realmente preenchidos: descarta `undefined`, `null` e strings vazias, mas **preserva `0` e `false`**. Assim, atualizar um campo não apaga os demais.
