import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	applyVariables,
	eduitApiRequest,
	getContactCustomFields,
	getDealCustomFields,
	getFlowFields,
	getInternalContentVariables,
	getInternalTemplates,
	getLossReasons,
	getPipelines,
	getQuickReplies,
	getStages,
	getTags,
	getWhatsappFlows,
	getWhatsappTemplates,
	getWhatsappTemplateVariables,
	pruneEmpty,
	readCustomFields,
	readKeyValuePairs,
	readTemplateVariables,
	resolveInternalContentText,
	resolveStageId,
} from './GenericFunctions';
import {
	contactFields,
	contactOperations,
	dealContactFields,
	dealContactOperations,
	dealFields,
	dealOperations,
	lossReasonFields,
	lossReasonOperations,
	messageFields,
	messageOperations,
	noteFields,
	noteOperations,
	searchFields,
	searchOperations,
	timelineFields,
	timelineOperations,
} from './descriptions';

export class EduitCrm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bwipo CRM',
		name: 'eduitCrm',
		icon: 'file:bwipo-icon-v2.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Opera o Bwipo CRM (contatos, negócios, mensagens, notas, timeline, busca e motivos de perda)',
		defaults: { name: 'Bwipo CRM' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'eduitCrmApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Deal + Contact', value: 'dealContact' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Deal', value: 'deal' },
					{ name: 'Timeline', value: 'timeline' },
					{ name: 'Loss Reason', value: 'lossReason' },
					{ name: 'Message', value: 'message' },
					{ name: 'Note', value: 'note' },
					{ name: 'Search', value: 'search' },
				],
				default: 'dealContact',
			},
			...dealContactOperations,
			...dealContactFields,
			...contactOperations,
			...contactFields,
			...dealOperations,
			...dealFields,
			...timelineOperations,
			...timelineFields,
			...lossReasonOperations,
			...lossReasonFields,
			...messageOperations,
			...messageFields,
			...noteOperations,
			...noteFields,
			...searchOperations,
			...searchFields,
		],
	};

	methods = {
		loadOptions: {
			getPipelines(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getPipelines.call(this);
			},
			getStages(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getStages.call(this);
			},
			getLossReasons(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getLossReasons.call(this);
			},
			getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getTags.call(this);
			},
			getContactCustomFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getContactCustomFields.call(this);
			},
			getDealCustomFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getDealCustomFields.call(this);
			},
			getWhatsappTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getWhatsappTemplates.call(this);
			},
			getWhatsappTemplateVariables(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				return getWhatsappTemplateVariables.call(this);
			},
			getInternalTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getInternalTemplates.call(this);
			},
			getQuickReplies(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getQuickReplies.call(this);
			},
			getInternalContentVariables(
				this: ILoadOptionsFunctions,
			): Promise<INodePropertyOptions[]> {
				return getInternalContentVariables.call(this);
			},
			getWhatsappFlows(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getWhatsappFlows.call(this);
			},
			getFlowFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return getFlowFields.call(this);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let result: IDataObject | IDataObject[] | undefined;

				if (resource === 'contact') {
					result = await handleContact.call(this, operation, i);
				} else if (resource === 'deal') {
					result = await handleDeal.call(this, operation, i);
				} else if (resource === 'timeline') {
					result = await handleTimeline.call(this, operation, i);
				} else if (resource === 'lossReason') {
					result = await handleLossReason.call(this, operation, i);
				} else if (resource === 'dealContact') {
					result = await handleDealContact.call(this, operation, i);
				} else if (resource === 'message') {
					result = await handleMessage.call(this, operation, i);
				} else if (resource === 'note') {
					result = await handleNote.call(this, operation, i);
				} else if (resource === 'search') {
					result = await handleSearch.call(this, operation, i);
				} else {
					throw new NodeOperationError(this.getNode(), `Resource não suportado: ${resource}`);
				}

				const rows = Array.isArray(result) ? result : [result ?? {}];
				for (const row of rows) {
					returnData.push({ json: row, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

// ──────────────────────────────────────────────
// Handlers por resource
// ──────────────────────────────────────────────

async function handleContact(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation === 'search') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		// `includeDeals` é sinalizador do node — não é filtro do backend.
		// Removido do qs para não virar querystring sem efeito (e não
		// confundir logs de acesso na API).
		const includeDeals = filters.includeDeals === true;
		const qs = pruneEmpty({ ...filters, includeDeals: undefined });
		const res = (await eduitApiRequest.call(this, 'GET', '/api/contacts', {}, qs)) as IDataObject;
		const contacts = (res.items as IDataObject[]) ?? [];

		if (!includeDeals) return contacts.length > 0 ? contacts : [res];

		// Enriquecimento opcional: para cada contato, busca os deals
		// vinculados via GET /api/deals?contactId=... (mesmo padrão do
		// Search > Search Full Record). Serial para preservar o rate
		// limit da API — a lista de retorno costuma ser pequena (perPage
		// padrão 20). Se precisar mais throughput no futuro, dá para
		// paralelizar com Promise.all.
		const enriched: IDataObject[] = [];
		for (const contact of contacts) {
			let deals: IDataObject[] = [];
			if (contact.id) {
				const dealsRes = (await eduitApiRequest.call(
					this,
					'GET',
					'/api/deals',
					{},
					{ contactId: contact.id as string, perPage: 100 },
				)) as IDataObject;
				deals = ((dealsRes.items as IDataObject[]) ?? []) as IDataObject[];
			}
			enriched.push({ ...contact, deals });
		}
		return enriched;
	}

	if (operation === 'create') {
		const name = this.getNodeParameter('name', i) as string;
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const body = pruneEmpty({ name, ...additional });
		const created = (await eduitApiRequest.call(
			this,
			'POST',
			'/api/contacts',
			body,
		)) as IDataObject;

		const customFields = readCustomFields(this, 'customFieldsUi', i);
		if (customFields.length > 0 && created.id) {
			created.customFields = await eduitApiRequest.call(
				this,
				'PUT',
				`/api/contacts/${encodeURIComponent(String(created.id))}/custom-fields`,
				{ values: customFields },
			);
		}
		return created;
	}

	if (operation === 'update') {
		const contactId = (this.getNodeParameter('contactId', i) as string).trim();
		if (!contactId) {
			throw new NodeOperationError(this.getNode(), 'Contact ID é obrigatório.', { itemIndex: i });
		}
		const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
		const body = pruneEmpty(updateFields);
		const customFields = readCustomFields(this, 'customFieldsUi', i);

		if (Object.keys(body).length === 0 && customFields.length === 0) {
			throw new NodeOperationError(this.getNode(), 'Informe ao menos um campo para atualizar.', {
				itemIndex: i,
			});
		}

		let result: IDataObject = {};
		if (Object.keys(body).length > 0) {
			result = (await eduitApiRequest.call(
				this,
				'PUT',
				`/api/contacts/${encodeURIComponent(contactId)}`,
				body,
			)) as IDataObject;
		}
		if (customFields.length > 0) {
			result.customFields = await eduitApiRequest.call(
				this,
				'PUT',
				`/api/contacts/${encodeURIComponent(contactId)}/custom-fields`,
				{ values: customFields },
			);
		}
		return result;
	}

	throw new NodeOperationError(this.getNode(), `Operação de contato não suportada: ${operation}`);
}

/**
 * Vincula tags a um negócio via `POST /api/deals/:id/tags`.
 *
 * A rota aceita uma tag por chamada, então percorremos a lista em série — a
 * seleção costuma ter poucas tags e serial preserva o rate limit da API. O
 * backend faz upsert na junção, então reexecutar o workflow não duplica nem
 * falha; tags que o negócio já tinha permanecem intactas.
 */
async function addTagsToDeal(
	this: IExecuteFunctions,
	dealId: string,
	tagIds: string[],
): Promise<IDataObject[]> {
	const endpoint = `/api/deals/${encodeURIComponent(dealId)}/tags`;
	const applied: IDataObject[] = [];
	for (const tagId of tagIds) {
		const res = (await eduitApiRequest.call(this, 'POST', endpoint, { tagId })) as IDataObject;
		applied.push({ tagId, ...res });
	}
	return applied;
}

/**
 * Mantém só custom fields com valor preenchido, no shape estável
 * `{ fieldId, name, label, type, value }`.
 */
function filledDealCustomFields(raw: unknown): IDataObject[] {
	if (!Array.isArray(raw)) return [];
	const out: IDataObject[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const row = item as IDataObject;
		const value = row.value === undefined || row.value === null ? '' : String(row.value);
		if (value.trim() === '') continue;
		const fieldId = String(row.fieldId ?? row.customFieldId ?? '').trim();
		out.push({
			...(fieldId ? { fieldId } : {}),
			...(row.name !== undefined ? { name: row.name } : {}),
			...(row.label !== undefined ? { label: row.label } : {}),
			...(row.type !== undefined ? { type: row.type } : {}),
			value,
		});
	}
	return out;
}

/**
 * Anexa `customFields` preenchidos a cada negócio da listagem.
 *
 * `GET /api/deals` hoje não traz os valores. Cada deal chama
 * `GET /api/deals/:id/custom-fields` (já Bearer) e descarta vazios.
 * Se a listagem já vier com `customFields` (backend atualizado), não
 * refaz a chamada.
 */
async function attachFilledDealCustomFields(
	this: IExecuteFunctions,
	deals: IDataObject[],
): Promise<IDataObject[]> {
	return Promise.all(
		deals.map(async (deal) => {
			if (Array.isArray(deal.customFields)) {
				return { ...deal, customFields: filledDealCustomFields(deal.customFields) };
			}
			const dealId = deal.id ? String(deal.id).trim() : '';
			if (!dealId) return { ...deal, customFields: [] };
			const raw = await eduitApiRequest.call(
				this,
				'GET',
				`/api/deals/${encodeURIComponent(dealId)}/custom-fields`,
			);
			return { ...deal, customFields: filledDealCustomFields(raw) };
		}),
	);
}

async function handleDeal(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation === 'search') {
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const pipelineId = (this.getNodeParameter('pipelineId', i, '') as string).trim();
		const stageId = resolveStageId(this, i);
		const qs = pruneEmpty({ ...filters, pipelineId, stageId });
		const res = (await eduitApiRequest.call(this, 'GET', '/api/deals', {}, qs)) as IDataObject;
		const items = ((res.items as IDataObject[]) ?? [res]) as IDataObject[];
		return attachFilledDealCustomFields.call(this, items);
	}

	if (operation === 'create') {
		const title = this.getNodeParameter('title', i) as string;
		const stageId = resolveStageId(this, i);
		if (!stageId) {
			throw new NodeOperationError(this.getNode(), 'Stage é obrigatório para criar um negócio.', {
				itemIndex: i,
			});
		}
		const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
		const body = pruneEmpty({ title, stageId, ...additional });
		const created = (await eduitApiRequest.call(this, 'POST', '/api/deals', body)) as IDataObject;

		const customFields = readCustomFields(this, 'customFieldsUi', i);
		if (customFields.length > 0 && created.id) {
			created.customFields = await eduitApiRequest.call(
				this,
				'PUT',
				`/api/deals/${encodeURIComponent(String(created.id))}/custom-fields`,
				{ values: customFields },
			);
		}
		return created;
	}

	if (operation === 'update') {
		const dealId = (this.getNodeParameter('dealId', i) as string).trim();
		if (!dealId) {
			throw new NodeOperationError(this.getNode(), 'Deal ID é obrigatório.', { itemIndex: i });
		}
		const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
		// `tagIds` não é campo do Deal: PUT /api/deals/:id ignora `tags` no body.
		// Tag vive em tabela de junção e tem rota própria, então é retirado daqui
		// e aplicado depois via POST /api/deals/:id/tags.
		const tagIds = Array.isArray(updateFields.tagIds)
			? (updateFields.tagIds as unknown[])
					.map((t) => String(t).trim())
					.filter((t) => t.length > 0)
			: [];
		const lostReason =
			typeof updateFields.lostReason === 'string' ? updateFields.lostReason.trim() : '';
		const body = pruneEmpty({
			...updateFields,
			tagIds: undefined,
			lostReason: undefined,
		});
		const customFields = readCustomFields(this, 'customFieldsUi', i);

		if (
			Object.keys(body).length === 0 &&
			customFields.length === 0 &&
			tagIds.length === 0 &&
			!lostReason
		) {
			throw new NodeOperationError(this.getNode(), 'Informe ao menos um campo para atualizar.', {
				itemIndex: i,
			});
		}

		let result: IDataObject = {};
		if (Object.keys(body).length > 0) {
			result = (await eduitApiRequest.call(
				this,
				'PUT',
				`/api/deals/${encodeURIComponent(dealId)}`,
				body,
			)) as IDataObject;
		}
		if (lostReason) {
			// Só gravar `lostReason` com status OPEN não aparece como motivo no
			// CRM. `PUT /api/deals/:id/status` chama markDealLost (status LOST,
			// closedAt, estágio Perdido). Fallback se a rota ainda for só sessão.
			try {
				result = (await eduitApiRequest.call(
					this,
					'PUT',
					`/api/deals/${encodeURIComponent(dealId)}/status`,
					{ status: 'LOST', lostReason },
				)) as IDataObject;
			} catch (error) {
				const httpCode = String((error as { httpCode?: string | number }).httpCode ?? '');
				if (httpCode !== '401' && httpCode !== '404') throw error;
				result = (await eduitApiRequest.call(
					this,
					'PUT',
					`/api/deals/${encodeURIComponent(dealId)}`,
					{ status: 'LOST', lostReason },
				)) as IDataObject;
			}
		}
		if (customFields.length > 0) {
			result.customFields = await eduitApiRequest.call(
				this,
				'PUT',
				`/api/deals/${encodeURIComponent(dealId)}/custom-fields`,
				{ values: customFields },
			);
		}
		if (tagIds.length > 0) {
			result.tags = await addTagsToDeal.call(this, dealId, tagIds);
		}
		return result;
	}

	if (operation === 'moveStage') {
		const dealId = (this.getNodeParameter('dealId', i) as string).trim();
		if (!dealId) {
			throw new NodeOperationError(this.getNode(), 'Deal ID é obrigatório.', { itemIndex: i });
		}
		const stageId = resolveStageId(this, i);
		if (!stageId) {
			throw new NodeOperationError(this.getNode(), 'Stage é obrigatório para mover o negócio.', {
				itemIndex: i,
			});
		}
		const position = this.getNodeParameter('position', i, 0) as number;
		// Usa PUT /api/deals/:id (aceita Bearer). Não usar /move (só sessão).
		const body: IDataObject = { stageId, position };
		return (await eduitApiRequest.call(
			this,
			'PUT',
			`/api/deals/${encodeURIComponent(dealId)}`,
			body,
		)) as IDataObject;
	}

	throw new NodeOperationError(this.getNode(), `Operação de negócio não suportada: ${operation}`);
}

async function handleLossReason(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation !== 'searchDeals') {
		throw new NodeOperationError(
			this.getNode(),
			`Operação de motivo de perda não suportada: ${operation}`,
		);
	}

	const lossReason = (this.getNodeParameter('lossReason', i, '') as string).trim();
	const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

	// GET /api/deals com status LOST + filtros avançados (mesmo payload do
	// kanban): `lostReasons` casa exato com Deal.lostReason e `closedAt` é a
	// data em que o negócio foi marcado como perdido.
	const advanced: IDataObject = {};
	if (lossReason) advanced.lostReasons = [lossReason];
	const closedAt = pruneEmpty({ from: filters.from, to: filters.to });
	if (Object.keys(closedAt).length > 0) advanced.closedAt = closedAt;

	const qs = pruneEmpty({
		status: 'LOST',
		perPage: filters.perPage,
		page: filters.page,
		filters: Object.keys(advanced).length > 0 ? JSON.stringify(advanced) : undefined,
	});
	const res = (await eduitApiRequest.call(this, 'GET', '/api/deals', {}, qs)) as IDataObject;
	return (res.items as IDataObject[]) ?? [res];
}

/**
 * Localiza um contato que já existe (ID → telefone → e-mail). Não cria.
 * 404 no GET por ID cai para telefone/e-mail; 401/403 sobem.
 */
async function resolveExistingContact(
	this: IExecuteFunctions,
	i: number,
): Promise<IDataObject> {
	const contactId = (this.getNodeParameter('contactId', i, '') as string).trim();
	const phone = (this.getNodeParameter('contactPhone', i, '') as string).trim();
	const email = (this.getNodeParameter('contactEmail', i, '') as string).trim();

	if (!contactId && !phone && !email) {
		throw new NodeOperationError(
			this.getNode(),
			'Informe o ID, telefone ou e-mail de um contato já existente. Este node não cria contato.',
			{ itemIndex: i },
		);
	}

	if (contactId) {
		try {
			const byId = (await eduitApiRequest.call(
				this,
				'GET',
				`/api/contacts/${encodeURIComponent(contactId)}`,
			)) as IDataObject;
			if (byId?.id) return byId;
		} catch (error) {
			const httpCode = String((error as { httpCode?: string | number }).httpCode ?? '');
			if (httpCode !== '404') throw error;
		}
	}

	if (phone) {
		const res = (await eduitApiRequest.call(
			this,
			'GET',
			'/api/contacts',
			{},
			{ phone, perPage: 1 },
		)) as IDataObject;
		const items = (res.items as IDataObject[]) ?? [];
		if (items[0]?.id) return items[0];
	}

	if (email) {
		const res = (await eduitApiRequest.call(
			this,
			'GET',
			'/api/contacts',
			{},
			{ email, perPage: 1 },
		)) as IDataObject;
		const items = (res.items as IDataObject[]) ?? [];
		if (items[0]?.id) return items[0];
	}

	throw new NodeOperationError(
		this.getNode(),
		'Contato não encontrado. Informe um ID, telefone ou e-mail de um contato que já exista — este node não cria contato.',
		{ itemIndex: i },
	);
}

async function handleDealContact(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation === 'createForExistingContact') {
		const existing = await resolveExistingContact.call(this, i);
		const contactId = String(existing.id);
		const stageId = resolveStageId(this, i);
		if (!stageId) {
			throw new NodeOperationError(
				this.getNode(),
				'Stage é obrigatório (Create Deal For Existing Contact).',
				{ itemIndex: i },
			);
		}
		const dealTitle = this.getNodeParameter('dealTitle', i, '') as string;
		const dealExtra = this.getNodeParameter('dealExtra', i, {}) as IDataObject;
		const deal = pruneEmpty({ stageId, title: dealTitle, ...dealExtra });
		const dealCf = readCustomFields(this, 'dealCustomFieldsUi', i);
		if (dealCf.length > 0) deal.customFields = dealCf;
		const trackedInfo = pruneEmpty(
			this.getNodeParameter('trackedInfo', i, {}) as IDataObject,
		);

		const body: IDataObject = {
			contact: { id: contactId, ...trackedInfo },
			deal,
			options: {
				reuseOpenDeal: this.getNodeParameter('reuseOpenDeal', i, true) as boolean,
			},
		};
		return (await eduitApiRequest.call(this, 'POST', '/api/leads', body)) as IDataObject;
	}

	if (operation !== 'createWithContact') {
		throw new NodeOperationError(this.getNode(), `Operação não suportada: ${operation}`);
	}

	const contactName = this.getNodeParameter('contactName', i, '') as string;
	const contactEmail = this.getNodeParameter('contactEmail', i, '') as string;
	const contactPhone = this.getNodeParameter('contactPhone', i, '') as string;
	const contactExtra = this.getNodeParameter('contactExtra', i, {}) as IDataObject;

	const trackedInfo = pruneEmpty(
		this.getNodeParameter('trackedInfo', i, {}) as IDataObject,
	);
	const contact = pruneEmpty({
		name: contactName,
		email: contactEmail,
		phone: contactPhone,
		...contactExtra,
		...trackedInfo,
	});

	// Precisa de algo para localizar/criar: id, telefone, e-mail ou nome.
	if (!contact.id && !contact.phone && !contact.email && !contact.name) {
		throw new NodeOperationError(
			this.getNode(),
			'Informe ao menos um identificador do contato (ID, telefone, e-mail) ou o nome para criar.',
			{ itemIndex: i },
		);
	}

	const stageId = resolveStageId(this, i);
	if (!stageId) {
		throw new NodeOperationError(this.getNode(), 'Stage é obrigatório (Create Deal With Contact).', {
			itemIndex: i,
		});
	}
	const dealTitle = this.getNodeParameter('dealTitle', i, '') as string;
	const dealExtra = this.getNodeParameter('dealExtra', i, {}) as IDataObject;
	const deal = pruneEmpty({ stageId, title: dealTitle, ...dealExtra });

	// Custom fields vão inline no /api/leads (resolve por fieldId). O backend
	// aceita [{ fieldId, value }] tanto no bloco contact quanto no deal.
	const contactCf = readCustomFields(this, 'contactCustomFieldsUi', i);
	if (contactCf.length > 0) contact.customFields = contactCf;
	const dealCf = readCustomFields(this, 'dealCustomFieldsUi', i);
	if (dealCf.length > 0) deal.customFields = dealCf;

	// Idempotência: a mesma pessoa costuma chegar duas vezes (item duplicado na
	// lista de origem, retry do workflow, execução repetida). Sem essas duas
	// travas, a segunda passada cria um negócio extra no kanban e sobrescreve
	// dados já corretos do contato — inclusive o telefone.
	const options: IDataObject = {
		reuseOpenDeal: this.getNodeParameter('reuseOpenDeal', i, true) as boolean,
		fillEmptyContactFieldsOnly: this.getNodeParameter(
			'fillEmptyContactFieldsOnly',
			i,
			true,
		) as boolean,
	};

	const body: IDataObject = { contact, deal, options };
	// Resposta real do backend:
	// { contact, contactCreated, deal, dealCreated, dealReused, missingCustomFields? }
	return (await eduitApiRequest.call(this, 'POST', '/api/leads', body)) as IDataObject;
}

/**
 * Envio de mensagem a partir de um negócio.
 *
 * Tudo passa por `POST /api/deals/:id/messages`: o CRM resolve o contato,
 * reusa o atendimento em aberto (ou abre um novo no canal padrão) e aplica as
 * mesmas regras de um envio feito por um operador no inbox — escopo de canal,
 * reabertura de ticket encerrado e registro no log de atividades.
 *
 * Variáveis de template vão como `[{ component, key, value }]`; quem monta o
 * `components` da Cloud API é o backend. Nenhum JSON da Meta é escrito aqui.
 */
async function handleMessage(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject> {
	const dealId = (this.getNodeParameter('dealId', i) as string).trim();
	if (!dealId) {
		throw new NodeOperationError(this.getNode(), 'Deal ID é obrigatório.', { itemIndex: i });
	}
	const options = this.getNodeParameter('messageOptions', i, {}) as IDataObject;
	const endpoint = `/api/deals/${encodeURIComponent(dealId)}/messages`;

	if (operation === 'sendNote' || operation === 'sendText') {
		const source = this.getNodeParameter('contentSource', i, 'manual') as string;

		let content: string;
		if (source === 'manual') {
			content = (this.getNodeParameter('content', i, '') as string).trim();
		} else {
			const template = await resolveInternalContentText(this, source, {
				internalTemplateId: this.getNodeParameter('internalTemplateId', i, '') as string,
				quickReplyId: this.getNodeParameter('quickReplyId', i, '') as string,
			});
			const override = String(options.textOverride ?? '').trim();
			const base = override || template;
			content = applyVariables(base, readKeyValuePairs(this, 'contentVariablesUi', i)).trim();
		}

		if (!content) {
			throw new NodeOperationError(
				this.getNode(),
				source === 'manual'
					? 'Conteúdo da mensagem é obrigatório.'
					: 'O modelo selecionado está vazio. Escolha outro ou use "Text Override".',
				{ itemIndex: i },
			);
		}

		const body: IDataObject = {
			kind: operation === 'sendNote' ? 'note' : 'text',
			content,
		};
		// Nota interna não passa por canal nem interrompe automações — enviar
		// esses campos só confundiria o log de acesso da API.
		if (operation === 'sendText') {
			if (options.channelId) body.channelId = String(options.channelId).trim();
			if (options.keepAutomations === true) body.stopAutomations = false;
		}
		return (await eduitApiRequest.call(this, 'POST', endpoint, body)) as IDataObject;
	}

	if (operation === 'sendInteractive') {
		const body = (this.getNodeParameter('interactiveBody', i, '') as string).trim();
		if (!body) {
			throw new NodeOperationError(
				this.getNode(),
				'O texto do body é obrigatório para mensagem interativa.',
				{ itemIndex: i },
			);
		}

		// `interactiveButtonsUi` é uma fixedCollection: `{ button: [{ title, id? }] }`.
		// Extraímos, trimamos e descartamos linhas sem title (usuário adicionou
		// linha vazia por acidente). O backend também valida — este check aqui
		// dá erro antes da chamada HTTP para preservar itens no n8n.
		const buttonsColl = this.getNodeParameter(
			'interactiveButtonsUi',
			i,
			{},
		) as IDataObject;
		const buttonRows = (buttonsColl.button as IDataObject[] | undefined) ?? [];
		const buttons = buttonRows
			.map((row) => {
				const title = row && typeof row.title === 'string' ? row.title.trim() : '';
				const id = row && typeof row.id === 'string' ? row.id.trim() : '';
				return { title, ...(id ? { id } : {}) };
			})
			.filter((b) => b.title.length > 0);

		if (buttons.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Informe ao menos 1 botão (com Title preenchido).',
				{ itemIndex: i },
			);
		}
		if (buttons.length > 3) {
			throw new NodeOperationError(
				this.getNode(),
				'Máximo de 3 botões por mensagem (limite Meta).',
				{ itemIndex: i },
			);
		}

		const header = (this.getNodeParameter('interactiveHeader', i, '') as string).trim();
		const footer = (this.getNodeParameter('interactiveFooter', i, '') as string).trim();

		const requestBody: IDataObject = {
			kind: 'interactive',
			body,
			buttons,
		};
		if (header) requestBody.header = header;
		if (footer) requestBody.footer = footer;
		if (options.channelId) requestBody.channelId = String(options.channelId).trim();
		if (options.keepAutomations === true) requestBody.stopAutomations = false;

		return (await eduitApiRequest.call(this, 'POST', endpoint, requestBody)) as IDataObject;
	}

	if (operation === 'sendList') {
		const listBody = (this.getNodeParameter('listBody', i, '') as string).trim();
		if (!listBody) {
			throw new NodeOperationError(
				this.getNode(),
				'O texto do body é obrigatório para lista interativa.',
				{ itemIndex: i },
			);
		}
		const listButton = (this.getNodeParameter('listButton', i, '') as string).trim();
		if (!listButton) {
			throw new NodeOperationError(
				this.getNode(),
				'O Button Label é obrigatório (rótulo do botão que abre a lista).',
				{ itemIndex: i },
			);
		}

		// `listRowsUi` é fixedCollection: `{ row: [{ title, description?, id? }] }`.
		const rowsColl = this.getNodeParameter('listRowsUi', i, {}) as IDataObject;
		const rowRows = (rowsColl.row as IDataObject[] | undefined) ?? [];
		const rows = rowRows
			.map((r) => {
				const title = r && typeof r.title === 'string' ? r.title.trim() : '';
				const description =
					r && typeof r.description === 'string' ? r.description.trim() : '';
				const id = r && typeof r.id === 'string' ? r.id.trim() : '';
				return {
					title,
					...(description ? { description } : {}),
					...(id ? { id } : {}),
				};
			})
			.filter((r) => r.title.length > 0);

		if (rows.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Informe ao menos 1 opção na lista (com Title preenchido).',
				{ itemIndex: i },
			);
		}
		if (rows.length > 10) {
			throw new NodeOperationError(
				this.getNode(),
				'Máximo de 10 opções na lista (limite Meta).',
				{ itemIndex: i },
			);
		}

		const sectionTitle = (this.getNodeParameter('listSectionTitle', i, '') as string).trim();
		const header = (this.getNodeParameter('listHeader', i, '') as string).trim();
		const footer = (this.getNodeParameter('listFooter', i, '') as string).trim();

		const requestBody: IDataObject = {
			kind: 'list',
			body: listBody,
			button: listButton,
			rows,
		};
		if (sectionTitle) requestBody.sectionTitle = sectionTitle;
		if (header) requestBody.header = header;
		if (footer) requestBody.footer = footer;
		if (options.channelId) requestBody.channelId = String(options.channelId).trim();
		if (options.keepAutomations === true) requestBody.stopAutomations = false;

		return (await eduitApiRequest.call(this, 'POST', endpoint, requestBody)) as IDataObject;
	}

	if (operation === 'sendTemplate') {
		const templateName = (this.getNodeParameter('templateName', i, '') as string).trim();
		if (!templateName) {
			throw new NodeOperationError(this.getNode(), 'Selecione um template.', { itemIndex: i });
		}

		const body: IDataObject = {
			kind: 'template',
			templateName,
			variables: readTemplateVariables(this, i),
		};

		const languageCode = String(options.languageCode ?? '').trim();
		if (languageCode) body.languageCode = languageCode;
		const flowToken = String(options.flowToken ?? '').trim();
		if (flowToken) body.flowToken = flowToken;

		const flowId = (this.getNodeParameter('flowId', i, '') as string).trim();
		if (flowId) {
			const flowActionData = readKeyValuePairs(this, 'flowActionDataUi', i);
			if (Object.keys(flowActionData).length > 0) body.flowActionData = flowActionData;
		}

		return (await eduitApiRequest.call(this, 'POST', endpoint, body)) as IDataObject;
	}

	throw new NodeOperationError(this.getNode(), `Operação de mensagem não suportada: ${operation}`);
}

async function handleNote(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation !== 'createOnDeal') {
		throw new NodeOperationError(this.getNode(), `Operação de nota não suportada: ${operation}`);
	}

	const dealId = (this.getNodeParameter('dealId', i) as string).trim();
	if (!dealId) {
		throw new NodeOperationError(this.getNode(), 'Deal ID é obrigatório.', { itemIndex: i });
	}
	const content = (this.getNodeParameter('content', i) as string).trim();
	if (!content) {
		throw new NodeOperationError(this.getNode(), 'Conteúdo da nota é obrigatório.', { itemIndex: i });
	}

	// POST /api/deals/:id/notes — após o ajuste 30/jul/26 no backend, cria
	// o `Note` (aparece em /pipeline) e, se o contato do deal tem conversa
	// vigente, cria também uma `Message` messageType=note isPrivate=true
	// (aparece em /inbox). Escopo por org é garantido pelo Bearer token.
	return (await eduitApiRequest.call(
		this,
		'POST',
		`/api/deals/${encodeURIComponent(dealId)}/notes`,
		{ content },
	)) as IDataObject;
}

async function handleTimeline(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (operation !== 'get') {
		throw new NodeOperationError(this.getNode(), `Operação de timeline não suportada: ${operation}`);
	}

	const dealId = (this.getNodeParameter('dealId', i) as string).trim();
	if (!dealId) {
		throw new NodeOperationError(this.getNode(), 'Deal ID é obrigatório.', { itemIndex: i });
	}
	const eventType = this.getNodeParameter('eventType', i) as string;
	const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

	const raw = await eduitApiRequest.call(
		this,
		'GET',
		`/api/deals/${encodeURIComponent(dealId)}/timeline`,
	);
	const events = Array.isArray(raw) ? (raw as IDataObject[]) : [];
	const matched =
		eventType === '*'
			? events
			: events.filter((ev) => String(ev.type ?? '') === eventType);

	if (matched.length === 0) {
		return {
			found: false,
			dealId,
			eventType,
			totalMatched: 0,
			message: 'Nenhum evento deste tipo na timeline do negócio.',
		};
	}

	const withFlags = matched.map((ev) => ({
		...ev,
		found: true,
		dealId,
	}));

	if (returnAll) return withFlags;
	return { ...withFlags[0], totalMatched: matched.length };
}

/** Campos de atribuição/UTM do contato — mesmos de CONTACT_TRACKING_KEYS no backend. */
const TRACKING_FIELD_KEYS = [
	'adUtmSource',
	'adUtmMedium',
	'adUtmCampaign',
	'adUtmContent',
	'adUtmTerm',
	'utmId',
	'utmReferrer',
	'referrer',
	'gclid',
	'fbclid',
	'googleClientId',
	'ttadId',
	'ttadName',
] as const;

function pickTrackingFields(contact: IDataObject): IDataObject {
	const tracking: IDataObject = {};
	for (const key of TRACKING_FIELD_KEYS) {
		tracking[key] = contact[key] ?? null;
	}
	return tracking;
}

async function handleSearch(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject> {
	if (operation !== 'fullRecord') {
		throw new NodeOperationError(this.getNode(), `Operação não suportada: ${operation}`);
	}

	const searchBy = this.getNodeParameter('searchBy', i, 'term') as string;
	const value = (this.getNodeParameter('value', i) as string).trim();
	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	if (!value) {
		throw new NodeOperationError(this.getNode(), 'Informe um valor para busca.', { itemIndex: i });
	}

	const perPage = (options.perPage as number) ?? 20;
	const onlyTracking = options.onlyTracking === true;
	const includeTracking = onlyTracking || options.includeTracking !== false;
	const includeDeals = !onlyTracking && options.includeDeals !== false;

	const qs: IDataObject = { perPage };
	if (includeTracking) qs.includeTracking = '1';
	if (searchBy === 'email') qs.email = value;
	else if (searchBy === 'phone') qs.phone = value;
	else if (searchBy === 'adSourceId') qs.adSourceId = value;
	else qs.search = value;

	const contactsRes = (await eduitApiRequest.call(
		this,
		'GET',
		'/api/contacts',
		{},
		qs,
	)) as IDataObject;
	let contacts = ((contactsRes.items as IDataObject[]) ?? []) as IDataObject[];

	if (onlyTracking) {
		contacts = contacts.map((c) => ({
			id: c.id,
			number: c.number,
			name: c.name,
			tracking: pickTrackingFields(c),
		}));
	}

	const results: IDataObject[] = [];
	const allDeals: IDataObject[] = [];
	for (const contact of contacts) {
		let deals: IDataObject[] = [];
		if (includeDeals && contact.id) {
			const dealsRes = (await eduitApiRequest.call(
				this,
				'GET',
				'/api/deals',
				{},
				{ contactId: contact.id as string, perPage: 100 },
			)) as IDataObject;
			deals = ((dealsRes.items as IDataObject[]) ?? []) as IDataObject[];
			allDeals.push(...deals);
		}
		results.push({ contact, deals });
	}

	// Não escolhe silenciosamente: retorna todos. mainContact/mainDeal são
	// apenas atalhos para o primeiro resultado (útil quando há 1 match claro).
	const mainContact = contacts.length > 0 ? contacts[0] : null;
	const mainDeal = allDeals.length > 0 ? allDeals[0] : null;

	return {
		query: { searchBy, value },
		totalContacts: contacts.length,
		totalDeals: allDeals.length,
		results,
		mainContact,
		mainDeal,
	};
}
