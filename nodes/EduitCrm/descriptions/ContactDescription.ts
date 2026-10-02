import type { INodeProperties } from 'n8n-workflow';

import { customFieldsCollection, LIFECYCLE_STAGE_OPTIONS } from './common';

export const contactOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				action: 'Search contacts',
				description: 'Busca contatos por termo, e-mail ou telefone',
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a contact',
				description: 'Cria um novo contato',
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a contact',
				description: 'Atualiza um contato existente pelo ID',
			},
		],
		default: 'search',
	},
];

const contactCommonFields: INodeProperties[] = [
	{ displayName: 'Email', name: 'email', type: 'string', default: '', placeholder: 'nome@dominio.com' },
	{ displayName: 'Phone', name: 'phone', type: 'string', default: '', placeholder: '+55 11 99999-9999' },
	{
		displayName: 'Lifecycle Stage',
		name: 'lifecycleStage',
		type: 'options',
		options: LIFECYCLE_STAGE_OPTIONS,
		default: '',
	},
	{ displayName: 'Source', name: 'source', type: 'string', default: '', description: 'Origem do contato (ex.: form, anúncio, n8n)' },
	{ displayName: 'Lead Score', name: 'leadScore', type: 'number', default: 0 },
	{ displayName: 'Company ID', name: 'companyId', type: 'string', default: '' },
	{ displayName: 'Owner (Assigned To) ID', name: 'assignedToId', type: 'string', default: '', description: 'ID do usuário responsável. Dropdown indisponível nesta versão (GET /api/users não aceita token).' },
	{ displayName: 'Avatar URL', name: 'avatarUrl', type: 'string', default: '' },
];

export const contactFields: INodeProperties[] = [
	// ── Search ──
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['search'] } },
		options: [
			{ displayName: 'Search Term', name: 'search', type: 'string', default: '', description: 'Busca textual em vários campos (nome, e-mail, telefone...)' },
			{ displayName: 'Email (Exact)', name: 'email', type: 'string', default: '', description: 'Match exato por e-mail (ideal para "existe?")' },
			{ displayName: 'Phone (Exact)', name: 'phone', type: 'string', default: '', description: 'Match exato por telefone (casa pelos dígitos)' },
			{
				displayName: 'Ad Source ID (Meta CTWA)',
				name: 'adSourceId',
				type: 'string',
				default: '',
				description:
					'Match exato pelo id do post/anúncio Meta que originou o contato (Contact.adSourceId, gravado pelo webhook Meta em referral.source_id). Útil para enumerar leads de um anúncio específico.',
			},
			{
				displayName: 'Lifecycle Stage',
				name: 'lifecycleStage',
				type: 'options',
				options: LIFECYCLE_STAGE_OPTIONS,
				default: '',
			},
			{
				displayName: 'Include Deals',
				name: 'includeDeals',
				type: 'boolean',
				default: false,
				description:
					'Whether to also fetch the deals linked to each contact returned. Faz uma chamada extra a GET /api/deals?contactId=... por contato.',
			},
			{ displayName: 'Limit', name: 'perPage', type: 'number', typeOptions: { minValue: 1 }, default: 20, description: 'Máximo de resultados por página' },
			{ displayName: 'Page', name: 'page', type: 'number', typeOptions: { minValue: 1 }, default: 1 },
		],
	},

	// ── Create ──
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['contact'], operation: ['create'] } },
		description: 'Nome do contato (obrigatório)',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['create'] } },
		options: contactCommonFields,
	},
	customFieldsCollection('customFieldsUi', 'contact', 'contact', ['create']),

	// ── Update ──
	{
		displayName: 'Contact ID',
		name: 'contactId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['contact'], operation: ['update'] } },
		description: 'ID do contato a atualizar',
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['update'] } },
		options: [
			{ displayName: 'Name', name: 'name', type: 'string', default: '' },
			...contactCommonFields,
		],
	},
	{
		displayName: 'Tracked Info',
		name: 'trackedInfo',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['update'] } },
		description:
			'Informação rastreada do contato (UTM, click IDs e Meta/CTWA). Todos os campos são opcionais. O que você preencher substitui o valor atual. Campo vazio não é enviado e não apaga o que já está salvo.',
		options: [
			{ displayName: 'utm_source', name: 'adUtmSource', type: 'string', default: '' },
			{ displayName: 'utm_medium', name: 'adUtmMedium', type: 'string', default: '' },
			{ displayName: 'utm_campaign', name: 'adUtmCampaign', type: 'string', default: '' },
			{ displayName: 'utm_content', name: 'adUtmContent', type: 'string', default: '' },
			{ displayName: 'utm_term', name: 'adUtmTerm', type: 'string', default: '' },
			{ displayName: 'utm_id', name: 'utmId', type: 'string', default: '' },
			{ displayName: 'utm_referrer', name: 'utmReferrer', type: 'string', default: '' },
			{ displayName: 'referrer', name: 'referrer', type: 'string', default: '' },
			{ displayName: 'gclientid', name: 'googleClientId', type: 'string', default: '' },
			{ displayName: 'gclid', name: 'gclid', type: 'string', default: '' },
			{ displayName: 'fbclid', name: 'fbclid', type: 'string', default: '' },
			{ displayName: 'ttad_id', name: 'ttadId', type: 'string', default: '' },
			{ displayName: 'ttad_name', name: 'ttadName', type: 'string', default: '' },
			{
				displayName: 'ctwa_clid',
				name: 'adCtwaClid',
				type: 'string',
				default: '',
				description: 'Click-to-WhatsApp (bloco Meta / CTWA)',
			},
			{
				displayName: 'ad_headline',
				name: 'adHeadline',
				type: 'string',
				default: '',
				description: 'Título do anúncio (bloco Meta / CTWA)',
			},
			{
				displayName: 'ad_id',
				name: 'adResolvedId',
				type: 'string',
				default: '',
				description: 'ID do anúncio no painel (bloco Meta / CTWA)',
			},
			{
				displayName: 'ad_source_id',
				name: 'adSourceId',
				type: 'string',
				default: '',
				description: 'ID da fonte do anúncio Meta (referral.source_id)',
			},
		],
	},
	customFieldsCollection('customFieldsUi', 'contact', 'contact', ['update']),
];
