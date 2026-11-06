# Integração com a API fiscal — simulação

Entrega local de 21/10/2026. Ponte separada do cadastro fiscal legado; nenhuma emissão oficial ou chamada ao governo. O painel da listagem Fiscal envia somente descrição fictícia e R$ 1,00, sem venda, cliente ou certificado real.

## Ativação no backend

Configurar no ambiente do backend (nunca em VITE_* ou no navegador):

```dotenv
FISCAL_SIMULATION_ENABLED=true
FISCAL_API_URL=http://127.0.0.1:3100
FISCAL_API_KEY=credencial-de-servico-da-api-fiscal
FISCAL_SIMULATION_EMITTERS_JSON={"ID_EMPRESA_ERP":"UUID_EMITENTE_FICTICIO_API"}
```

Criar previamente um emitente fictício na API e um perfil vigente para a data atual. O smoke:local da API prepara o CNPJ fictício 11222333000181. A credencial precisa de nfse:emit e documents:read, vinculada ao emitente correspondente. Não usar o emitente real para esse teste. URL remota exige HTTPS; HTTP somente em loopback. Em contêiner, loopback é o próprio contêiner: configurar rede/HTTPS antes de publicar.

Aplicar o índice único de fiscalSimulations em empresaId + requestId antes de habilitar a funcionalidade. O índice está declarado no schema e no script existente scripts/migrate-indexes.js (este script também trata outros índices; revisar seu escopo antes de executá-lo em produção).

Reiniciar o backend com as variáveis e compilar/publicar o frontend normalmente. Sem a configuração, o painel fica oculto. A credencial não é devolvida ao navegador. A empresa vem do usuário autenticado, não do corpo da solicitação. As permissões são NOTA_FISCAL_CONSULTAR e NOTA_FISCAL_EMITIR; usuários sem emissão podem apenas consultar.

## Operação e recuperação

- GET /fiscal-simulacoes/configuracao: informa disponibilidade para a empresa autenticada.
- POST /fiscal-simulacoes/:uuid: inicia ou recupera a mesma tentativa. O payload e a data são fixados antes da chamada externa.
- GET /fiscal-simulacoes/:uuid: consulta apenas o registro pertencente à empresa autenticada.
- O painel preserva o UUID no sessionStorage por empresa e usuário; reload na mesma aba preserva a tentativa. Fechar a aba pode perder esse identificador no navegador, mas não apaga o registro no backend.
- Após falha de rede, “Recuperar tentativa” reutiliza a chave. Nenhum erro provoca fallback para emissão real ou outra chave.
- Mudança do vínculo de emitente bloqueia a operação antiga para revisão administrativa.
- A resposta externa precisa corresponder a emitente, referência e modo simulado, com fiscalValidity=false. Não é copiada integralmente para o navegador.
- A simulação não entra na coleção de notas fiscais legadas nem recebe número fiscal.

## Verificação

```powershell
npx jest fiscal-simulation.service.spec.ts --runInBand
node -r ts-node/register test/fiscal-simulation.integration.ts D:\Projetos\mantec-fiscal-api\.env
```

O segundo comando aceita somente Mongo fiscal 127.0.0.1:27117, cria e remove banco exclusivo de teste. Mantém na API fiscal a operação sintética como evidência. Verifica concorrência, unicidade, recuperação por nova instância e isolamento de empresa.

## Limites

## Histórico e comprovantes de simulação — etapa seguinte

Implementado em 21/10/2026:

- GET /fiscal-simulacoes retorna as 20 operações mais recentes da empresa autenticada; nextCursor alimenta o parâmetro before para recuperar páginas anteriores, sem offsets instáveis.
- O painel permite selecionar uma operação anterior mesmo depois de fechar a aba e baixar o comprovante quando disponível.
- Ao consultar ou receber um resultado terminal validado, o backend grava um comprovante JSON versão 1, com bytes persistidos e SHA-256. Escrita condicional preserva o primeiro comprovante sob concorrência. Não contém chave de API, certificado, senha ou resposta integral do provedor.
- GET /fiscal-simulacoes/:id/comprovante exige permissão de consulta e vínculo à empresa; retorna attachment JSON, no-store, nosniff e X-Content-SHA256. SHA-256 detecta inconsistência do arquivo; não é assinatura digital nem proteção contra alteração simultânea do arquivo e hash por administrador do banco.
- Registros sem resultado terminal não geram comprovante. A consulta do resultado conclui o arquivamento de operações antigas. Histórico e comprovantes já gravados independem da disponibilidade/configuração da API externa; submissão e atualização de resultados continuam exigindo integração ativa.
- O arquivo é comprovante de SIMULAÇÃO SEM VALIDADE FISCAL. Não é XML fiscal, NFS-e nem DANFSe.
- Índice adicional empresaId + _id descendente adicionado ao schema e roteiro de índices.

Verificado com Mongo e API fiscal locais: concorrência, recuperação, paginação de 23 registros em duas páginas sem duplicação, isolamento, ausência de comprovante pendente, bytes idênticos após nova consulta, download com integração desabilitada, rejeição de conteúdo adulterado e download HTTP com cabeçalhos e UUID validados. O teste HTTP substitui os guards por identidade de teste; as permissões reais seguem os guards existentes e a revisão visual autenticada continua pendente. Builds e lint frontend/backend aprovados; backend mantém 21 avisos preexistentes sem erros.

## Limites remanescentes

## Configuração fiscal na interface — avanço de 21/10/2026

O administrador mestre (perfis admin/administrador) pode cadastrar um vínculo persistente da empresa da sessão a um emitente já existente na API. O formulário pede o UUID desse emitente fictício, não lista emitentes de outras empresas e não recebe empresaId arbitrário do navegador. O índice único impede vincular um emitente a duas empresas e impede dois vínculos na mesma empresa. Vínculos existentes são imutáveis por esta tela. createdBy e timestamps preservam a autoria do vínculo; a auditoria de versões fiscais fica na API, com ID do usuário ERP incluído no motivo.

Configuração global FISCAL_SIMULATION_ENABLED, FISCAL_API_URL e FISCAL_API_KEY permanece necessária no backend. FISCAL_SIMULATION_EMITTERS_JSON passa a ser fallback para instalações legadas; vínculos novos são gravados em fiscalSimulationBindings. Conflitos com o mapa legado e com operações de outro emitente são recusados. Revisar/aplicar os índices dessa coleção antes de habilitar a tela em ambiente publicado.

Na listagem Fiscal, “Configuração fiscal de teste da empresa” permite ao administrador mestre ou admin_empresa consultar e adicionar perfis por vigência. Os demais perfis são recusados pelo backend, mesmo que tentem chamar a rota diretamente. A API continua aplicando seus escopos e vínculos de credencial; para esta etapa são necessários emitters:read, profiles:read e profiles:write além dos escopos da simulação. Credencial continua exclusivamente no backend.

Rotas adicionadas:
- POST /fiscal-simulacoes/configuracao/vinculo: somente mestre; vincula emitente existente à empresa atual, sem criar empresa no governo.
- GET /fiscal-simulacoes/configuracao/perfis: mestre/admin_empresa, somente emitente vinculado.
- POST /fiscal-simulacoes/configuracao/perfis: nova versão declarada com expectedRevision, vigência, regime, código IBGE, inscrição municipal opcional e motivo.

Mudanças não alteram versões anteriores. Revisão concorrente ou vigência anterior/igual gera conflito; a tela recarrega o histórico antes de permitir nova tentativa. Perfil MEI/Simples/Lucro Presumido/Lucro Real é apenas cadastro para simulação: não significa que a geração oficial de cada regime foi implementada. Nenhum imposto é calculado neste formulário.

Testado contra API fiscal e Mongo locais com emitente fictício exclusivo: vínculo idempotente, duplicação entre empresas recusada, admin_empresa impedido de vincular, técnico impedido de consultar configuração, empresa sem vínculo recusada, revisão desatualizada recusada e duas versões preservadas (MEI → Simples Nacional). Registros do ensaio permanecem na API fiscal local como dados fictícios. Nenhuma empresa ou perfil fiscal real foi alterado. Build/lint e testes da ponte aprovados; revisão visual autenticada pendente.

## Próximas entregas

## Cadastro do emitente pelo ERP — 21/10/2026

## Consulta do certificado no ERP — 21/10/2026

GET /fiscal-simulacoes/configuracao/certificado consulta o emitente vinculado à empresa autenticada, exigindo permissão NOTA_FISCAL_CONSULTAR e perfil mestre/admin_empresa. A credencial de serviço precisa do escopo certificates:read. A tela está dentro de “Configuração fiscal de teste da empresa”, após carregar o vínculo/perfis.

O backend retorna exclusivamente situação, datas e dias restantes; não repassa histórico, titular, número de série, CNPJ, certificado, chave, senha nem mensagens arbitrárias da API. Respostas malformadas ou com officialReady=true são recusadas nesta integração simulada. Falha de conexão não é apresentada como certificado ausente.

A tela distingue ausente, desativado, vencido, ainda não válido, próximo do vencimento (limiar da API: 30 dias) e dentro do período de validade. Sempre informa que revogação e habilitação oficial não foram verificadas. O teste PowerShell do titular não importa A1 no banco: é possível o A1 ter passado no diagnóstico e esta tela informar ausência, corretamente. Atualização ocorre ao abrir e pelo botão de consulta; não há agendamento, e-mail ou notificação externa.

Esta entrega não faz upload, troca, desativação ou revogação de certificado. Gestão do material A1 pela interface, revisão visual autenticada e publicação continuam pendentes. Testes cobrem todos os estados, filtragem de campos secretos inesperados, metadata inválida, serviço indisponível e isolamento/perfis.

## Cadastro recuperável

Implementado formulário de cadastro fictício (CNPJ, razão social, cidade e UF) para administrador mestre. O backend grava a tentativa por empresa em fiscalEmitterRegistrations antes de chamar POST /v1/emitters/ensure. Esse endpoint da API cria/recupera por consumidor + CNPJ e aceita replay somente com dados cadastrais idênticos. A resposta é validada e o vínculo empresa/emitente é persistido usando as proteções já existentes. O navegador não precisa conhecer o UUID para um cadastro novo.

Rotas ERP: GET /fiscal-simulacoes/configuracao/cadastro consulta a tentativa da empresa atual; POST na mesma rota cadastra ou recupera. Ambas exigem mestre; admin_empresa continua restrito aos perfis fiscais do vínculo existente. Repetição com conteúdo diferente gera conflito; cadastro existente nunca é sobrescrito. O formulário recupera os dados persistidos após falha/reabertura e trava edição enquanto a tentativa estiver pendente. Correção/abandono de tentativa pendente conflitante ainda requer revisão administrativa; não há exclusão ou substituição automática, pois pode haver emitente remoto já criado.

Índice único por empresa em fiscalEmitterRegistrations acrescentado ao roteiro de índices. A credencial da API precisa também de emitters:write e permissão de cadastrar emitentes (emitterIds='*'); é credencial de serviço privada do backend. Preferir credencial dedicada ao ERP. API fiscal deve ser atualizada antes de ativar o frontend novo. O mapa legado e os vínculos existentes continuam válidos; uma empresa previamente vinculada não recebe outro cadastro por este fluxo.

O botão de vínculo manual continua como alternativa para emitentes já preparados. Após cadastro novo, adicionar primeiro perfil vigente; sem perfil a simulação não será autorizada. Não há sincronização automática com o cadastro comercial da empresa, cadastro governamental ou emissão oficial.

Validação desta entrega: API fiscal com 76 testes unitários e 23 testes de API/worker aprovados; 10 testes unitários da ponte ERP aprovados. Ensaio ERP com banco local confirmou perda de resposta após criação remota, tentativa persistida, recusa de conteúdo divergente e recuperação por nova instância com o mesmo vínculo. Builds e lint frontend/backend aprovados, com avisos preexistentes no backend. API fiscal local Docker atualizada; ERP não publicado. Revisão visual do formulário em sessão autenticada ainda pendente.

Ainda falta automatizar cadastro/sincronização cadastral de emitentes, gestão de certificados pela interface, venda/OS reais, documentos oficiais, cancelamento e publicação. Esta entrega elimina edição do mapa de emitentes por variável de ambiente para vínculos novos, mas não elimina a preparação inicial de acesso à API nem o cadastro prévio do emitente fictício.

Entrega é a primeira integração simulada do ERP, não conclusão da etapa 7. Ainda faltam cadastro/sincronização de emitentes e perfis pela interface, certificados, operações reais de venda/OS, armazenamento de XML/DANFSe, eventos/cancelamento, webhooks, publicação e ensaios operacionais. Consulta municipal pendente não foi alterada. Nenhum ambiente remoto foi publicado. A revisão visual autenticada do painel no navegador ainda está pendente.

## Envio e substituição do A1 pelo ERP — 22/10/2026

Implementado POST /fiscal-simulacoes/configuracao/certificado, restrito a gestores autenticados e ao emitente vinculado à empresa da sessão. O corpo não aceita escolha de empresa ou emitente. Requer o evento nota_fiscal.emitir e o escopo certificates:write na credencial da API, além de certificates:read para consultar a revisão.

A interface aceita PFX/P12 de até 24 KiB, senha e motivo; exige HTTPS, exceto localhost. A revisão obtida na consulta acompanha o envio: a API fiscal aplica compare-and-set para impedir substituições concorrentes. Não há repetição automática após falha. O formulário limpa arquivo e senha após a tentativa e consulta novamente o estado para esclarecer respostas perdidas. A senha não é persistida pelo ERP. Strings em JavaScript e cópias internas de transporte não possuem garantia de apagamento físico imediato; não registrar corpos dessas requisições no proxy/APM.

A API fiscal existente valida arquivo, chave, CNPJ, validade e cadeia antes da troca e armazena o conteúdo cifrado. Configuração local ainda usa raízes sintéticas: preparar raízes ICP-Brasil confiáveis e custódia das chaves antes de importar A1 real. Não foi importado o certificado pessoal do usuário. Revogação e emissão oficial permanecem pendentes.

Validação: 25 testes unitários do serviço ERP, integração local ERP/API (incluindo isolamento da consulta), builds frontend/backend e lint sem erros (21 avisos preexistentes no backend). O upload na ponte foi testado com respostas controladas; teste completo autenticado da nova tela ainda pendente. Alterações locais, sem publicação.

Validação adicional concluída: 10 testes de integração de certificados da API fiscal aprovados com PKI sintética (senha inválida, isolamento, cifragem, renovação, revisão antiga e recuperação de chave). Isso testa o serviço receptor; não substitui o teste autenticado completo do formulário ERP.

## Conexao hospedada — 31/10/2026

Backend configurado na stack mantec3 para FISCAL_API_URL=https://fiscal.portalmantec.com.br e FISCAL_SIMULATION_ENABLED=true. Credencial recebida exclusivamente via FISCAL_API_KEY_FILE=/run/secrets/fiscal-api-key, Docker Secret fiscal_erp_api_key_v1. A chave original e os hashes foram conferidos no servidor; nenhum valor foi gravado neste documento. Backup da stack anterior em diretorio root-only. O servico usa usuario node (UID 1000), que recebe permissao de leitura do secret.

Falta vincular/cadastrar o emitente real por empresa pela configuracao fiscal do ERP antes de simular; a conexao de servico nao cria empresas nem autoriza emissao oficial. Apenas administrador mestre pode preparar esse cadastro/vinculo. Dados e perfis fiscais ficam por emitente. Validacao local: 26 testes unitarios do servico e build aprovados. A API exige TLS e mantem modo simulado.

## Cadastro inicial sem falso erro — 05/11/2026

A consulta de perfis sem emitente vinculado agora responde409 com code FISCAL_EMITTER_UNBOUND, somente depois de validar configuracao local de URL/chave/mapa. Configuracao invalida continua503 com FISCAL_CONNECTION_NOT_CONFIGURED. GETconfiguracao adiciona state bound/unbound/unavailable ao enabled existente; este estado descreve configuracao/vinculo, nao comprova disponibilidade remota.

A tela orienta o mestre a cadastrar/vincular emitente quando recebe o codigo exato de ausencia de vinculo, e continua mostrando erro em falhas de rede/autenticacao/configuracao. A mensagem de perfis nao sobrescreve erro ao recuperar cadastro pendente. Vinculo manual de emitente existente aparece como opcao separada. 28 testes unitarios do servico e build backend aprovados.

## Gestao fiscal pela propria empresa — 05/11/2026

Cadastro, perfil e A1 agora ficam em Dados da empresa (/minha-empresa), junto do cadastro geral e usando seu estilo. A pagina Fiscal mantem operacoes/historico e um link para Dados da empresa. O painel utiliza somente os dados da empresa apos GET/PATCH bem-sucedido; alteracoes nao salvas nao alimentam o emitente.

admin_empresa pode consultar/registrar o cadastro fiscal da propria empresa. Antes de qualquer cadastro remoto, o backend le Empresa pelo id da sessao e confere CNPJ normalizado, razao social, cidade/UF com o payload. A empresa nao informa outra empresaId nem vincula um UUID livremente. O vinculo automatico usa o emitente retornado do cadastro validado; o endpoint publico de vinculo manual permanece exclusivo do mestre. Perfis e A1 continuam limitados ao emitente vinculado a empresa da sessao.

Cadastros e certificados existentes nao sao migrados, apagados ou substituidos. Divergencias entre cadastro geral e fiscal sao mostradas para conferencia. O mestre preserva o fluxo de suporte/legado; admin_empresa usa os dados salvos da propria empresa. Perfil e A1 recarregam suas revisoes apos alteracoes para evitar conflitos provocados pela propria tela. Respostas antigas sao invalidadas ao trocar empresa/sessao.

Validacao: 38 testes focados de backend aprovados; integracao real local com Mongo/API/worker passou incluindo auto-cadastro admin_empresa e recuperacao de resposta perdida. Typecheck/build/lint aprovados (21 avisos preexistentes no backend). Frontend build/lint/typecheck e cinco testes existentes aprovados. Testes usam empresas/certificados ficticios; nenhum dado fiscal real foi alterado pelo procedimento.

## Avisos internos de pendencias cadastrais — 05/11/2026

GET /fiscal-simulacoes/configuracao/pendencias exige evento nota_fiscal.consultar e perfil admin/administrador/admin_empresa. A empresa vem exclusivamente da sessao autenticada. A resposta tem state (pending/clear/unavailable), pendingCount, items com mensagens estaticas e destino /minha-empresa, checkedAt e officialRegistrationVerified=false. Cache-Control: no-store. Nenhum documento de notificacao, e-mail ou mensagem externa e criado pela consulta.

Verifica campos obrigatorios do cadastro geral, formato/digitos do CNPJ, e-mail e UF; falta do vinculo fiscal; divergencia de CNPJ, razao social, cidade ou UF entre cadastro geral e emitente; ausencia de perfil vigente na data de Brasilia; A1 ausente, desativado, vencido, ainda nao valido ou proximo do vencimento. A inscricao municipal nao e tratada como obrigatoria indiscriminadamente. CNPJ validado localmente nao comprova situacao cadastral ou regularidade tributaria oficial.

Consulta remota e somente leitura e usa o emitente vinculado a propria empresa. As tres respostas remotas precisam de revisoes compativeis; alteracao concorrente ou resposta invalida torna a verificacao indisponivel/parcial. Falha da API/configuracao nao vira ausencia de certificado/perfil. Itens locais ou remotos ja confirmados podem acompanhar state=unavailable, sem afirmar que representam todas as pendencias. Perfil futuro ou historico nao supre ausencia de perfil vigente; validUntilExclusive exclui o dia final.

O frontend apresenta sino no topo e aviso na pagina Fiscal, com acesso a Dados da empresa. O estado e recalculado apos alteracoes cadastrais/fiscais e ao retomar a janela; nao ha pop-ups repetidos por navegacao. Somente os gestores autorizados veem esses detalhes, limitados a empresa da sessao. clear significa apenas ausencia das pendencias locais verificadas, nunca autorizacao para emissao ou regularidade perante o governo.

Validacao: 57 testes novos para os avisos; 235 testes unitarios backend e 5 e2e aprovados. Integracao local com Mongo/API/worker confirmou a evolucao das pendencias antes/depois do cadastro e perfil. Build/typecheck sem erros e lint com os 21 avisos preexistentes. Nenhum cadastro ou certificado real foi alterado pelos testes.
