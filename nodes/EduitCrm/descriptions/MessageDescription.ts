import type { INodeProperties } from 'n8n-workflow';

export const messageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['message'] } },
		options: [
			{
				name: 'Send Internal Note',
				value: 'sendNote',
				action: 'Send an internal note on a deal',
				description:
					'Cria uma nota interna: aparece na timeline do /inbox e na aba "Notas" do negócio. O cliente não recebe nada.',
			},
			{
				name: 'Send WhatsApp Message',
				value: 'sendText',
				action: 'Send a whats app message on a deal',
				description:
					'Envia mensagem de texto pelo WhatsApp do contato do negócio. Exige janela de 24h aberta — fora dela, use template.',
			},
			{
				name: 'Send WhatsApp Template',
				value: 'sendTemplate',
				action: 'Send a whats app template on a deal',
				description:
					'Envia um template aprovado da WABA, com as variáveis preenchidas por seleção. Funciona mesmo fora da janela de 24h.',
			},
			{
				name: 'Send WhatsApp with Buttons (Interactive)',
				value: 'sendInteractive',
				action: 'Send whats app message with reply buttons',
				description:
					'Envia mensagem interativa de WhatsApp com 1 a 3 botões de resposta rápida (Meta Cloud API). Exige janela de 24h aberta — botões só aparecem dentro da sessão. Para fora da janela, use template.',
			},
			{
				name: 'Send WhatsApp List (Interactive)',
				value: 'sendList',
				action: 'Send whats app message with list menu',
				description:
					'Envia mensagem interativa de WhatsApp com uma lista de até 10 opções (Meta Cloud API). Aparece como um botão único que abre um menu — use quando precisar de mais de 3 opções. Exige janela de 24h aberta.',
			},
		],
		default: 'sendText',
	},
];

const SHOW_ALL = { resource: ['message'] };
const SHOW_WHATSAPP = {
	resource: ['message'],
	operation: ['sendText', 'sendTemplate', 'sendInteractive', 'sendList'],
};
const SHOW_CONTENT = { resource: ['message'], operation: ['sendNote', 'sendText'] };
const SHOW_TEMPLATE = { resource: ['message'], operation: ['sendTemplate'] };
const SHOW_INTERACTIVE = { resource: ['message'], operation: ['sendInteractive'] };
const SHOW_LIST = { resource: ['message'], operation: ['sendList'] };

export const messageFields: INodeProperties[] = [
	{
		displayName: 'Deal ID',
		name: 'dealId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: SHOW_ALL },
		description:
			'ID do negócio. O CRM resolve o contato e a conversa de WhatsApp — reusando o atendimento em aberto ou abrindo um novo no canal padrão da organização.',
	},
	{
		displayName: 'WhatsApp Channel Name or ID',
		name: 'channelId',
		type: 'options',
		default: '',
		typeOptions: { loadOptionsMethod: 'getWhatsappChannels' },
		displayOptions: { show: SHOW_WHATSAPP },
		description:
			'WhatsApp da organização por onde a mensagem sai. A lista traz os canais conectados e os demais, com telefone e status. Vazio usa o canal da conversa (ou o padrão da organização, se ainda não houver conversa). Escolha na lista ou use uma expressão com o ID do canal.',
	},

	// ── Conteúdo (nota interna e texto) ──────────
	{
		displayName: 'Content Source',
		name: 'contentSource',
		type: 'options',
		default: 'manual',
		displayOptions: { show: SHOW_CONTENT },
		options: [
			{
				name: 'Manual Text',
				value: 'manual',
				description: 'Escreve o texto direto no node',
			},
			{
				name: 'Internal Template',
				value: 'internalTemplate',
				description: 'Usa um modelo de mensagem cadastrado em Configurações → Modelos',
			},
			{
				name: 'Quick Reply',
				value: 'quickReply',
				description: 'Usa uma resposta rápida (as mesmas do atalho "/" no inbox)',
			},
		],
		description: 'De onde vem o texto da mensagem',
	},
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 4 },
		displayOptions: { show: { ...SHOW_CONTENT, contentSource: ['manual'] } },
		description: 'Texto da mensagem ou da nota',
	},
	{
		displayName: 'Internal Template Name or ID',
		name: 'internalTemplateId',
		type: 'options',
		default: '',
		required: true,
		typeOptions: { loadOptionsMethod: 'getInternalTemplates' },
		displayOptions: { show: { ...SHOW_CONTENT, contentSource: ['internalTemplate'] } },
		description:
			'Modelo cadastrado na organização. O texto de cada modelo aparece na descrição da opção. Escolha na lista ou use uma expressão.',
	},
	{
		displayName: 'Quick Reply Name or ID',
		name: 'quickReplyId',
		type: 'options',
		default: '',
		required: true,
		typeOptions: { loadOptionsMethod: 'getQuickReplies' },
		displayOptions: { show: { ...SHOW_CONTENT, contentSource: ['quickReply'] } },
		description:
			'Resposta rápida da organização. O texto aparece na descrição da opção. Escolha na lista ou use uma expressão.',
	},
	{
		displayName: 'Content Variables',
		name: 'contentVariablesUi',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Adicionar variável',
		typeOptions: { multipleValues: true },
		displayOptions: {
			show: { ...SHOW_CONTENT, contentSource: ['internalTemplate', 'quickReply'] },
		},
		description:
			'Preenche os `{{...}}` do modelo escolhido. A substituição acontece no node — o CRM recebe o texto final.',
		options: [
			{
				displayName: 'Variable',
				name: 'item',
				values: [
					{
						displayName: 'Variable Name or ID',
						name: 'key',
						type: 'options',
						default: '',
						typeOptions: {
							loadOptionsMethod: 'getInternalContentVariables',
							loadOptionsDependsOn: ['contentSource', 'internalTemplateId', 'quickReplyId'],
						},
						description:
							'Placeholder encontrado no texto do modelo. Escolha na lista ou use uma expressão.',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Valor que substitui o placeholder',
					},
				],
			},
		],
	},

	// ── Template da Meta ─────────────────────────
	{
		displayName: 'Template Name or ID',
		name: 'templateName',
		type: 'options',
		default: '',
		required: true,
		typeOptions: { loadOptionsMethod: 'getWhatsappTemplates' },
		displayOptions: { show: SHOW_TEMPLATE },
		description:
			'Template aprovado na WABA da organização. A descrição de cada opção mostra o cabeçalho, o corpo e os botões — é o preview do que será enviado. Escolha na lista ou use uma expressão.',
	},
	{
		displayName: 'Template Variables',
		name: 'templateVariablesUi',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Adicionar variável',
		typeOptions: { multipleValues: true },
		displayOptions: { show: SHOW_TEMPLATE },
		description:
			'Preenche os `{{...}}` do template. A lista já traz apenas os placeholders que existem no template escolhido, separados por cabeçalho, corpo e botão.',
		options: [
			{
				displayName: 'Variable',
				name: 'variable',
				values: [
					{
						displayName: 'Variable Name or ID',
						name: 'variable',
						type: 'options',
						default: '',
						typeOptions: {
							loadOptionsMethod: 'getWhatsappTemplateVariables',
							loadOptionsDependsOn: ['templateName'],
						},
						description:
							'Placeholder do template. Escolha na lista ou use uma expressão.',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Valor que substitui o placeholder no envio',
					},
				],
			},
		],
	},
	{
		displayName: 'Flow Name or ID',
		name: 'flowId',
		type: 'options',
		default: '',
		typeOptions: { loadOptionsMethod: 'getWhatsappFlows' },
		displayOptions: { show: SHOW_TEMPLATE },
		description:
			'Só para templates com botão Flow. Selecionar o flow libera a lista de campos das telas para montar os dados iniciais do formulário. Escolha na lista ou use uma expressão.',
	},
	{
		displayName: 'Flow Initial Data',
		name: 'flowActionDataUi',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Adicionar campo',
		typeOptions: { multipleValues: true },
		displayOptions: { show: SHOW_TEMPLATE, hide: { flowId: [''] } },
		description:
			'Valores que abrem preenchidos no formulário do Flow (`flow_action_data`). As chaves vêm das telas do flow selecionado.',
		options: [
			{
				displayName: 'Field',
				name: 'item',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'key',
						type: 'options',
						default: '',
						typeOptions: {
							loadOptionsMethod: 'getFlowFields',
							loadOptionsDependsOn: ['flowId'],
						},
						description:
							'Campo de uma das telas do flow. Escolha na lista ou use uma expressão.',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Valor inicial do campo',
					},
				],
			},
		],
	},

	// ── Botões interativos (Meta Cloud API) ──────
	{
		displayName: 'Body',
		name: 'interactiveBody',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 4 },
		displayOptions: { show: SHOW_INTERACTIVE },
		description:
			'Texto principal exibido acima dos botões. Aceita expressões n8n ({{ $json.nome }}). Máx. 1024 caracteres (limite Meta).',
	},
	{
		displayName: 'Buttons',
		name: 'interactiveButtonsUi',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Adicionar botão',
		typeOptions: { multipleValues: true, sortable: true, maxValue: 3 },
		displayOptions: { show: SHOW_INTERACTIVE },
		description:
			'De 1 a 3 botões (limite Meta). A ordem aqui é a ordem que o cliente vê no WhatsApp.',
		options: [
			{
				displayName: 'Button',
				name: 'button',
				values: [
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						required: true,
						default: '',
						description:
							'Texto do botão que o cliente vê. Máx. 20 caracteres (a Meta corta o excesso). Aceita expressões n8n.',
					},
					{
						displayName: 'ID (Payload)',
						name: 'id',
						type: 'string',
						default: '',
						description:
							'Identificador retornado quando o cliente clica (chega no webhook como payload). Vazio gera btn_1/btn_2/btn_3 automaticamente. Máx. 256 caracteres.',
					},
				],
			},
		],
	},
	{
		displayName: 'Header',
		name: 'interactiveHeader',
		type: 'string',
		default: '',
		displayOptions: { show: SHOW_INTERACTIVE },
		description:
			'Cabeçalho de texto (opcional). Aparece em negrito acima do body. Máx. 60 caracteres.',
	},
	{
		displayName: 'Footer',
		name: 'interactiveFooter',
		type: 'string',
		default: '',
		displayOptions: { show: SHOW_INTERACTIVE },
		description:
			'Rodapé de texto (opcional). Aparece em cinza abaixo dos botões. Máx. 60 caracteres.',
	},

	// ── Lista interativa (Meta Cloud API) ────────
	{
		displayName: 'Body',
		name: 'listBody',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 4 },
		displayOptions: { show: SHOW_LIST },
		description:
			'Texto principal exibido acima do botão que abre a lista. Aceita expressões n8n. Máx. 4096 caracteres (limite Meta).',
	},
	{
		displayName: 'Button Label',
		name: 'listButton',
		type: 'string',
		required: true,
		default: 'Ver opções',
		displayOptions: { show: SHOW_LIST },
		description:
			'Rótulo do botão único que o cliente toca para abrir a lista. Ex.: "Ver cursos", "Escolher horário". Máx. 20 caracteres.',
	},
	{
		displayName: 'Section Title',
		name: 'listSectionTitle',
		type: 'string',
		default: '',
		displayOptions: { show: SHOW_LIST },
		description:
			'Nome da seção que agrupa as opções na lista (opcional). Máx. 24 caracteres. Vazio esconde o cabeçalho.',
	},
	{
		displayName: 'Rows',
		name: 'listRowsUi',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Adicionar opção',
		typeOptions: { multipleValues: true, sortable: true, maxValue: 10 },
		displayOptions: { show: SHOW_LIST },
		description:
			'De 1 a 10 opções na lista (limite Meta). A ordem aqui é a ordem que o cliente vê.',
		options: [
			{
				displayName: 'Row',
				name: 'row',
				values: [
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						required: true,
						default: '',
						description:
							'Texto principal da opção. Máx. 24 caracteres (a Meta corta o excesso). Aceita expressões n8n.',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description:
							'Texto secundário que aparece embaixo do title, em cinza (opcional). Máx. 72 caracteres.',
					},
					{
						displayName: 'ID (Payload)',
						name: 'id',
						type: 'string',
						default: '',
						description:
							'Identificador retornado quando o cliente escolhe (chega no webhook como payload). Vazio gera row_1/row_2/... automaticamente. Máx. 200 caracteres.',
					},
				],
			},
		],
	},
	{
		displayName: 'Header',
		name: 'listHeader',
		type: 'string',
		default: '',
		displayOptions: { show: SHOW_LIST },
		description:
			'Cabeçalho de texto (opcional). Aparece em negrito acima do body. Máx. 60 caracteres.',
	},
	{
		displayName: 'Footer',
		name: 'listFooter',
		type: 'string',
		default: '',
		displayOptions: { show: SHOW_LIST },
		description:
			'Rodapé de texto (opcional). Aparece em cinza abaixo do botão. Máx. 60 caracteres.',
	},

	// ── Opções ───────────────────────────────────
	{
		displayName: 'Options',
		name: 'messageOptions',
		type: 'collection',
		default: {},
		placeholder: 'Adicionar opção',
		displayOptions: { show: SHOW_ALL },
		options: [
			{
				displayName: 'Flow Token',
				name: 'flowToken',
				type: 'string',
				default: '',
				description:
					'Identificador da sessão do Flow. Vazio faz o CRM gerar um por envio, que é o recomendado.',
			},
			{
				displayName: 'Keep Running Automations',
				name: 'keepAutomations',
				type: 'boolean',
				default: false,
				description:
					'Whether automações em andamento para o contato continuam após o envio. Por padrão o envio as encerra, como faz a resposta de um operador — evita que um salesbot mande mensagens sobrepostas.',
			},
			{
				displayName: 'Language Code',
				name: 'languageCode',
				type: 'string',
				default: '',
				description:
					'Idioma do template (ex.: pt_BR). Vazio usa o idioma declarado no próprio template.',
			},
			{
				displayName: 'Text Override',
				name: 'textOverride',
				type: 'string',
				default: '',
				typeOptions: { rows: 4 },
				description:
					'Substitui completamente o texto do modelo ou da resposta rápida, mantendo a seleção como referência',
			},
		],
	},
];
