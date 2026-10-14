import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type EduitContext =
	| IExecuteFunctions
	| ILoadOptionsFunctions
	| IHookFunctions
	| IWebhookFunctions;

/**
 * Wrapper único para todas as chamadas à API do CRM. Usa o helper de
 * autenticação do n8n (injeta o Bearer da credencial eduitCrmApi) e normaliza
 * a baseUrl removendo barras finais para evitar `//api/...`.
 */
export async function eduitApiRequest(
	this: EduitContext,
	method: IHttpRequestMethods,
	resourcePath: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<any> {
	const credentials = await this.getCredentials('eduitCrmApi');
	const baseUrl = String(credentials.baseUrl ?? '').replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${resourcePath}`,
		qs,
		body,
		json: true,
	};

	// GET/DELETE não devem carregar corpo; idem quando o body está vazio.
	if (method === 'GET' || method === 'DELETE' || Object.keys(body).length === 0) {
		delete options.body;
	}
	if (Object.keys(qs).length === 0) {
		delete options.qs;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'eduitCrmApi', options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

type RawPipeline = {
	id: string;
	name: string;
	stages?: Array<{ id: string; name: string }>;
};

type RawTag = { id: string; name: string; color?: string | null };

/**
 * Carrega as tags da organização (GET /api/tags devolve um array direto).
 *
 * O catálogo de tags é compartilhado entre contatos e negócios — a separação
 * fica nas tabelas de junção do backend, então a mesma lista serve para os
 * dois casos. A cor entra na `description` porque a org pode ter tags de nome
 * parecido em contextos diferentes, e a cor é o que as distingue no board.
 */
export async function getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = (await eduitApiRequest.call(this, 'GET', '/api/tags')) as
		| RawTag[]
		| { items?: RawTag[] };
	const tags = Array.isArray(response) ? response : response.items ?? [];
	return tags.map((t) => ({
		name: t.name,
		value: t.id,
		...(t.color?.trim() ? { description: `Cor: ${t.color.trim()}` } : {}),
	}));
}

type RawWhatsAppChannel = {
	id: string;
	name: string;
	phoneNumber?: string | null;
	provider?: string;
	status?: string;
};

const WHATSAPP_PROVIDER_LABEL: Record<string, string> = {
	META_CLOUD_API: 'API oficial',
	BAILEYS_MD: 'QR',
};

const WHATSAPP_STATUS_LABEL: Record<string, string> = {
	CONNECTED: 'conectado',
	CONNECTING: 'conectando',
	QR_READY: 'aguardando QR',
	DISCONNECTED: 'desconectado',
	FAILED: 'falha',
};

/**
 * WhatsApps da organização (`GET /api/channels/whatsapp`). O value é o id
 * do canal — o mesmo que o envio aceita em `channelId`.
 */
export async function getWhatsappChannels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const response = (await eduitApiRequest.call(this, 'GET', '/api/channels/whatsapp')) as
		| RawWhatsAppChannel[]
		| { channels?: RawWhatsAppChannel[] };
	const channels = Array.isArray(response) ? response : response.channels ?? [];
	return channels
		.filter((c) => typeof c.id === 'string' && c.id.trim() !== '' && typeof c.name === 'string')
		.map((c) => {
			const phone = c.phoneNumber?.trim();
			const provider = c.provider ? WHATSAPP_PROVIDER_LABEL[c.provider] ?? c.provider : '';
			const status = c.status ? WHATSAPP_STATUS_LABEL[c.status] ?? c.status : '';
			return {
				name: phone ? `${c.name} · ${phone}` : c.name,
				value: c.id,
				description: [provider, status].filter(Boolean).join(' · ') || undefined,
			};
		});
}

/** Carrega os pipelines da org (GET /api/pipelines retorna um array direto). */
export async function getPipelines(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = (await eduitApiRequest.call(this, 'GET', '/api/pipelines')) as
		| RawPipeline[]
		| { items?: RawPipeline[] };
	const pipelines = Array.isArray(response) ? response : response.items ?? [];
	return pipelines.map((p) => ({ name: p.name, value: p.id }));
}

/**
 * Carrega os stages do pipeline selecionado. Depende do parâmetro `pipelineId`
 * do node (loadOptionsDependsOn). Como GET /api/pipelines já traz os stages
 * embutidos, reusamos a mesma resposta em vez de uma rota separada.
 */
export async function getStages(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const pipelineId = this.getNodeParameter('pipelineId', '') as string;
	const response = (await eduitApiRequest.call(this, 'GET', '/api/pipelines')) as
		| RawPipeline[]
		| { items?: RawPipeline[] };
	const pipelines = Array.isArray(response) ? response : response.items ?? [];

	const target = pipelineId
		? pipelines.find((p) => p.id === pipelineId)
		: undefined;
	const stages = target?.stages ?? [];
	return stages.map((s) => ({ name: s.name, value: s.id }));
}

type RawLossReasonCatalog = {
	id?: string;
	label?: string;
	isActive?: boolean;
	pipelineIds?: string[];
};
type RawLossReasonItem = { reason: string; count: number; totalValue: number };

/**
 * Motivos de perda da org, na ordem do catálogo
 * (`GET /api/settings/loss-reasons`). O value é o **label** — é o que
 * o CRM grava em `Deal.lostReason`.
 *
 * Fallback: `GET /api/analytics/losses` (só motivos já usados em deals
 * LOST) caso o backend ainda não aceite Bearer no catálogo.
 */
export async function getLossReasons(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	try {
		const catalog = (await eduitApiRequest.call(this, 'GET', '/api/settings/loss-reasons')) as
			| RawLossReasonCatalog[]
			| { items?: RawLossReasonCatalog[] };
		const rows = Array.isArray(catalog) ? catalog : catalog.items ?? [];
		const options = rows
			.filter(
				(r) =>
					typeof r.label === 'string' &&
					r.label.trim() !== '' &&
					r.isActive !== false,
			)
			.map((r) => ({
				name: r.label!.trim(),
				value: r.label!.trim(),
			}));
		if (options.length > 0) return options;
	} catch {
		// Catálogo ainda session-only — cai no agregado de deals perdidos.
	}

	const response = (await eduitApiRequest.call(this, 'GET', '/api/analytics/losses')) as {
		items?: RawLossReasonItem[];
	};
	const items = response.items ?? [];
	return items
		.filter((r) => typeof r.reason === 'string' && r.reason.trim() !== '' && r.reason !== '(sem motivo)')
		.map((r) => ({
			name: r.reason,
			value: r.reason,
			description: `${r.count} negócio(s) perdido(s)`,
		}));
}

type RawCustomField = { id: string; name: string; label?: string };

async function loadCustomFieldOptions(
	ctx: ILoadOptionsFunctions,
	entity: 'contact' | 'deal',
): Promise<INodePropertyOptions[]> {
	const response = (await eduitApiRequest.call(
		ctx,
		'GET',
		'/api/custom-fields',
		{},
		{ entity },
	)) as RawCustomField[] | { items?: RawCustomField[] };
	const fields = Array.isArray(response) ? response : response.items ?? [];
	return fields.map((f) => ({
		name: f.label && f.label.trim() ? `${f.label} (${f.name})` : f.name,
		value: f.id,
	}));
}

/** Campos personalizados de Contato (GET /api/custom-fields?entity=contact). */
export async function getContactCustomFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadCustomFieldOptions(this, 'contact');
}

/** Campos personalizados de Negócio (GET /api/custom-fields?entity=deal). */
export async function getDealCustomFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return loadCustomFieldOptions(this, 'deal');
}

/**
 * Lê uma fixedCollection de custom fields (`{ field: [{ fieldId, value }] }`)
 * e devolve `[{ fieldId, value }]` pronto para os endpoints de valores.
 * Mantém value como string (inclusive vazia, que limpa o campo no CRM) e
 * descarta entradas sem fieldId.
 */
export function readCustomFields(
	ctx: IExecuteFunctions,
	paramName: string,
	itemIndex: number,
): Array<{ fieldId: string; value: string }> {
	const coll = ctx.getNodeParameter(paramName, itemIndex, {}) as IDataObject;
	const rows = (coll.field as IDataObject[] | undefined) ?? [];
	const out: Array<{ fieldId: string; value: string }> = [];
	for (const row of rows) {
		const fieldId = row && row.fieldId ? String(row.fieldId).trim() : '';
		if (!fieldId) continue;
		const value = row.value === undefined || row.value === null ? '' : String(row.value);
		out.push({ fieldId, value });
	}
	return out;
}

/**
 * Monta um objeto somente com os campos realmente preenchidos.
 *
 * Regra (definida no escopo): preserva `0` e `false`; descarta `undefined`,
 * `null` e string vazia/somente espaços. Útil em Update para não apagar
 * campos existentes ao enviar um valor "vazio" sem querer.
 */
export function pruneEmpty(input: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.trim() === '') continue;
		out[key] = value;
	}
	return out;
}

/**
 * Resolve o valor de um stage considerando o fallback manual.
 * Quando o usuário escolhe "Informar ID manualmente", lê `stageIdManual`;
 * caso contrário usa o dropdown `stageId`.
 */
export function resolveStageId(ctx: IExecuteFunctions, itemIndex: number): string {
	const useManual = ctx.getNodeParameter('stageSource', itemIndex, 'list') === 'manual';
	const value = useManual
		? (ctx.getNodeParameter('stageIdManual', itemIndex, '') as string)
		: (ctx.getNodeParameter('stageId', itemIndex, '') as string);
	return (value ?? '').trim();
}

// ──────────────────────────────────────────────
// Mensagens: catálogo de templates, respostas rápidas e flows
// ──────────────────────────────────────────────

/**
 * Separador do valor composto `componente::chave` usado no dropdown de
 * variáveis. Duplo para não colidir com nomes de placeholder que contenham
 * `:` (a Meta permite).
 */
const VAR_SEP = '::';

/** Extrai chaves únicas de `{{1}}`, `{{nome}}` na ordem de aparição. */
function extractPlaceholders(text: string | undefined | null): string[] {
	if (!text) return [];
	const keys: string[] = [];
	const seen = new Set<string>();
	const re = /\{\{([^}]+)\}\}/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		const k = m[1].trim();
		if (k && !seen.has(k)) {
			seen.add(k);
			keys.push(k);
		}
	}
	return keys;
}

function truncate(text: string, max = 240): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

type ApprovedTemplate = {
	metaTemplateId?: string;
	metaTemplateName: string;
	label?: string;
	language?: string;
	category?: string | null;
	bodyPreview?: string;
	headerPreview?: string;
	hasButtons?: boolean;
	buttons?: Array<{ type: string; text: string; url: string | null }>;
	hasVariables?: boolean;
	flowId?: string | null;
	headerFormat?: string | null;
};

async function fetchApprovedTemplates(ctx: ILoadOptionsFunctions): Promise<ApprovedTemplate[]> {
	const res = (await eduitApiRequest.call(
		ctx,
		'GET',
		'/api/whatsapp-template-configs/approved',
	)) as ApprovedTemplate[] | { items?: ApprovedTemplate[] };
	return Array.isArray(res) ? res : res.items ?? [];
}

/**
 * Templates aprovados na WABA da organização (resolvida pelo token da
 * credencial). A `description` de cada opção carrega o corpo do template —
 * é o preview que o n8n exibe na própria lista, já que não existe campo de
 * preview reativo na UI de node.
 */
export async function getWhatsappTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const templates = await fetchApprovedTemplates(this);
	return templates.map((t) => {
		const label = t.label?.trim() || t.metaTemplateName;
		const parts: string[] = [];
		if (t.headerPreview?.trim()) parts.push(`[Cabeçalho] ${t.headerPreview.trim()}`);
		if (t.bodyPreview?.trim()) parts.push(t.bodyPreview.trim());
		const buttons = (t.buttons ?? []).map((b) => `${b.text || b.type} (${b.type})`);
		if (buttons.length > 0) parts.push(`[Botões] ${buttons.join(' · ')}`);
		return {
			name: `${label} · ${t.language ?? 'pt_BR'}${t.flowId ? ' · Flow' : ''}`,
			value: t.metaTemplateName,
			description: truncate(parts.join('\n')) || 'Template sem corpo de texto',
		};
	});
}

/**
 * Variáveis do template selecionado, uma opção por placeholder. O valor
 * carrega o componente alvo (`body`, `header`, `button`) porque a Cloud API
 * exige parâmetros separados por componente — o operador só vê o rótulo.
 */
export async function getWhatsappTemplateVariables(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const templateName = this.getNodeParameter('templateName', '') as string;
	if (!templateName) return [];

	const templates = await fetchApprovedTemplates(this);
	const target = templates.find((t) => t.metaTemplateName === templateName);
	if (!target) return [];

	const options: INodePropertyOptions[] = [];

	for (const key of extractPlaceholders(target.headerPreview)) {
		options.push({
			name: `Cabeçalho — {{${key}}}`,
			value: `header${VAR_SEP}${key}`,
			description: truncate(target.headerPreview ?? ''),
		});
	}
	for (const key of extractPlaceholders(target.bodyPreview)) {
		options.push({
			name: `Corpo — {{${key}}}`,
			value: `body${VAR_SEP}${key}`,
			description: truncate(target.bodyPreview ?? ''),
		});
	}
	// Botão URL com sufixo dinâmico: a Meta indexa pelo botão, não pelo nome
	// do placeholder, então o índice vai embutido no valor.
	(target.buttons ?? []).forEach((btn, index) => {
		for (const key of extractPlaceholders(btn.url)) {
			options.push({
				name: `Botão "${btn.text || index + 1}" — {{${key}}}`,
				value: `button${VAR_SEP}${index}${VAR_SEP}${key}`,
				description: truncate(btn.url ?? ''),
			});
		}
	});

	return options;
}

type InternalTemplate = { id: string; name: string; content?: string; category?: string | null };

/** Modelos de mensagem cadastrados na org (Configurações → Modelos). */
export async function getInternalTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const res = (await eduitApiRequest.call(this, 'GET', '/api/templates')) as
		| InternalTemplate[]
		| { items?: InternalTemplate[] };
	const items = Array.isArray(res) ? res : res.items ?? [];
	return items.map((t) => ({
		name: t.category?.trim() ? `${t.name} (${t.category})` : t.name,
		value: t.id,
		description: truncate(t.content ?? ''),
	}));
}

type QuickReply = { id: string; title: string; content?: string; category?: string | null };

/** Respostas rápidas da org (as mesmas do atalho "/" no inbox). */
export async function getQuickReplies(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const res = (await eduitApiRequest.call(this, 'GET', '/api/quick-replies')) as
		| QuickReply[]
		| { items?: QuickReply[] };
	const items = Array.isArray(res) ? res : res.items ?? [];
	return items.map((q) => ({
		name: q.category?.trim() ? `${q.title} (${q.category})` : q.title,
		value: q.id,
		description: truncate(q.content ?? ''),
	}));
}

/**
 * Variáveis do conteúdo interno selecionado (modelo ou resposta rápida).
 * Diferente do template da Meta, aqui a substituição é feita pelo próprio
 * node antes de enviar — o CRM guarda o texto já resolvido.
 */
export async function getInternalContentVariables(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const source = this.getNodeParameter('contentSource', 'manual') as string;
	const text = await resolveInternalContentText(this, source, {
		internalTemplateId: this.getNodeParameter('internalTemplateId', '') as string,
		quickReplyId: this.getNodeParameter('quickReplyId', '') as string,
	});
	return extractPlaceholders(text).map((key) => ({
		name: `{{${key}}}`,
		value: key,
		description: truncate(text),
	}));
}

type FlowDefinition = {
	id: string;
	shortId?: string;
	name: string;
	status?: string;
	metaFlowId?: string | null;
	flowCategory?: string | null;
};

/** Flows do WhatsApp definidos na org, para montar o `flow_action_data`. */
export async function getWhatsappFlows(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const res = (await eduitApiRequest.call(this, 'GET', '/api/whatsapp-flow-definitions')) as
		| FlowDefinition[]
		| { items?: FlowDefinition[] };
	const items = Array.isArray(res) ? res : res.items ?? [];
	return items.map((f) => ({
		name: `${f.name}${f.status ? ` · ${f.status}` : ''}`,
		value: f.id,
		description: [f.flowCategory, f.metaFlowId ? `Meta ID ${f.metaFlowId}` : null]
			.filter(Boolean)
			.join(' · '),
	}));
}

type FlowDetail = {
	name?: string;
	screens?: Array<{
		title?: string | null;
		screenId?: string | null;
		fields?: Array<{ name?: string | null; label?: string | null }>;
	}>;
};

/**
 * Campos das telas do flow selecionado — viram as chaves do
 * `flow_action_data`, para o operador escolher em vez de digitar.
 */
export async function getFlowFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const flowId = this.getNodeParameter('flowId', '') as string;
	if (!flowId) return [];
	const flow = (await eduitApiRequest.call(
		this,
		'GET',
		`/api/whatsapp-flow-definitions/${encodeURIComponent(flowId)}`,
	)) as FlowDetail;

	const options: INodePropertyOptions[] = [];
	for (const screen of flow.screens ?? []) {
		for (const field of screen.fields ?? []) {
			const key = field.name?.trim();
			if (!key) continue;
			options.push({
				name: `${field.label?.trim() || key}${screen.title ? ` — ${screen.title}` : ''}`,
				value: key,
				description: screen.screenId ? `Tela ${screen.screenId}` : undefined,
			});
		}
	}
	return options;
}

// ──────────────────────────────────────────────
// Leitura dos campos de mensagem no execute
// ──────────────────────────────────────────────

export type TemplateVariable = {
	component: 'body' | 'header' | 'button';
	key: string;
	value: string;
	buttonIndex?: number;
};

/**
 * Converte a fixedCollection de variáveis do template no formato que
 * `POST /api/deals/:id/messages` espera. O backend monta o `components` da
 * Cloud API a partir daqui — o node nunca envia JSON da Meta cru.
 */
export function readTemplateVariables(
	ctx: IExecuteFunctions,
	itemIndex: number,
): TemplateVariable[] {
	const coll = ctx.getNodeParameter('templateVariablesUi', itemIndex, {}) as IDataObject;
	const rows = (coll.variable as IDataObject[] | undefined) ?? [];
	const out: TemplateVariable[] = [];
	for (const row of rows) {
		const raw = row?.variable ? String(row.variable) : '';
		if (!raw) continue;
		const parts = raw.split(VAR_SEP);
		const component = parts[0] as TemplateVariable['component'];
		const value = row.value === undefined || row.value === null ? '' : String(row.value);

		if (component === 'button') {
			// `button::<índice>::<chave>`
			out.push({
				component,
				buttonIndex: Number(parts[1] ?? 0) || 0,
				key: parts[2] ?? '',
				value,
			});
			continue;
		}
		out.push({ component: component === 'header' ? 'header' : 'body', key: parts[1] ?? '', value });
	}
	return out.filter((v) => v.key.length > 0);
}

/** Lê uma fixedCollection genérica `{ item: [{ key, value }] }` como objeto. */
export function readKeyValuePairs(
	ctx: IExecuteFunctions,
	paramName: string,
	itemIndex: number,
): IDataObject {
	const coll = ctx.getNodeParameter(paramName, itemIndex, {}) as IDataObject;
	const rows = (coll.item as IDataObject[] | undefined) ?? [];
	const out: IDataObject = {};
	for (const row of rows) {
		const key = row?.key ? String(row.key).trim() : '';
		if (!key) continue;
		out[key] = row.value === undefined || row.value === null ? '' : String(row.value);
	}
	return out;
}

/**
 * Busca o texto do conteúdo interno escolhido (modelo ou resposta rápida).
 * Compartilhado entre o `loadOptions` de variáveis e o `execute`, para que o
 * dropdown e o envio leiam sempre a mesma fonte.
 */
export async function resolveInternalContentText(
	ctx: EduitContext,
	source: string,
	ids: { internalTemplateId?: string; quickReplyId?: string },
): Promise<string> {
	if (source === 'internalTemplate') {
		const id = (ids.internalTemplateId ?? '').trim();
		if (!id) return '';
		const res = (await eduitApiRequest.call(ctx, 'GET', '/api/templates')) as
			| InternalTemplate[]
			| { items?: InternalTemplate[] };
		const items = Array.isArray(res) ? res : res.items ?? [];
		return items.find((t) => t.id === id)?.content ?? '';
	}
	if (source === 'quickReply') {
		const id = (ids.quickReplyId ?? '').trim();
		if (!id) return '';
		const res = (await eduitApiRequest.call(ctx, 'GET', '/api/quick-replies')) as
			| QuickReply[]
			| { items?: QuickReply[] };
		const items = Array.isArray(res) ? res : res.items ?? [];
		return items.find((q) => q.id === id)?.content ?? '';
	}
	return '';
}

/**
 * Substitui `{{chave}}` pelos valores informados. Placeholders sem valor
 * permanecem no texto, deixando visível o que faltou preencher em vez de
 * enviar um trecho vazio ao cliente.
 */
export function applyVariables(text: string, vars: IDataObject): string {
	return text.replace(/\{\{([^}]+)\}\}/g, (match, raw: string) => {
		const key = String(raw).trim();
		return key in vars ? String(vars[key] ?? '') : match;
	});
}
