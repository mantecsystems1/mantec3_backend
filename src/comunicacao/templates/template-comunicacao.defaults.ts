export const TEMPLATE_COMUNICACAO_DEFAULTS = [
  {
    chave: 'orcamento.enviado',
    nome: 'Orcamento enviado',
    assunto: 'Orcamento {{codigo}}',
    mensagem: 'Ola, {{cliente}}. Seu orcamento {{codigo}} no valor de {{valor}} esta disponivel para analise. Acesse o portal: {{link}}',
    variaveis: ['cliente', 'codigo', 'valor', 'link'],
  },
  {
    chave: 'os.status',
    nome: 'Status da OS',
    assunto: 'Atualizacao da OS {{codigo}}',
    mensagem: 'Ola, {{cliente}}. Sua OS {{codigo}} esta com status: {{status}}. Acompanhe pelo portal: {{link}}',
    variaveis: ['cliente', 'codigo', 'status', 'link'],
  },
  {
    chave: 'venda.recibo',
    nome: 'Recibo de venda',
    assunto: 'Recibo {{codigo}}',
    mensagem: 'Ola, {{cliente}}. Seu recibo {{codigo}} no valor de {{valor}} esta disponivel para consulta e download no portal: {{link}}',
    variaveis: ['cliente', 'codigo', 'valor', 'link'],
  },
  {
    chave: 'garantia.status',
    nome: 'Status da garantia',
    assunto: 'Atualizacao da garantia {{codigo}}',
    mensagem: 'Ola, {{cliente}}. Sua garantia {{codigo}} esta com status: {{status}}. Acompanhe o historico pelo portal: {{link}}',
    variaveis: ['cliente', 'codigo', 'status', 'link'],
  },
] as const;
