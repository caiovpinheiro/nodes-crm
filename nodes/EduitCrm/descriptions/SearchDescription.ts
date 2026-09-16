import type { INodeProperties } from 'n8n-workflow';

export const searchOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['search'] } },
		options: [
			{
				name: 'Search Full Record',
				value: 'fullRecord',
				action: 'Search a full record',
				description:
					'Busca contatos e, para cada um, os negócios vinculados. Retorna todos os resultados + mainContact/mainDeal',
			},
		],
		default: 'fullRecord',
	},
];

const SHOW = { resource: ['search'], operation: ['fullRecord'] };

export const searchFields: INodeProperties[] = [
	{
		displayName: 'Search By',
		name: 'searchBy',
		type: 'options',
		default: 'term',
		displayOptions: { show: SHOW },
		options: [
			{ name: 'General Term', value: 'term', description: 'Busca textual ampla (nome, e-mail, telefone...)' },
			{ name: 'Email (Exact)', value: 'email' },
			{ name: 'Phone (Exact)', value: 'phone' },
			{
				name: 'Ad Source ID (Meta CTWA)',
				value: 'adSourceId',
				description:
					'Contatos originados de um post/anúncio Meta específico (Contact.adSourceId — id retornado pelo webhook Meta em referral.source_id)',
			},
		],
	},
	{
		displayName: 'Value',
		name: 'value',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: SHOW },
		description: 'Valor a buscar (termo, e-mail ou telefone, conforme "Search By")',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: SHOW },
		options: [
			{ displayName: 'Max Contacts', name: 'perPage', type: 'number', typeOptions: { minValue: 1 }, default: 20, description: 'Máximo de contatos retornados' },
			{ displayName: 'Include Deals', name: 'includeDeals', type: 'boolean', default: true, description: 'Whether to also fetch the deals linked to each contact' },
			{
				displayName: 'Include Tracked Info',
				name: 'includeTracking',
				type: 'boolean',
				default: true,
				description:
					'Whether to also return the tracked info of each contact (utm_source/medium/campaign/content/term, utm_id, referrer, gclid, fbclid, google_client_id, ttad_id/ttad_name)',
			},
			{
				displayName: 'Only Tracked Info',
				name: 'onlyTracking',
				type: 'boolean',
				default: false,
				description:
					'Whether to return only the tracked info of each contact (id, nome e o grupo "tracking"). Ignora "Include Deals" — útil para alimentar planilhas/relatórios de origem',
			},
		],
	},
];
