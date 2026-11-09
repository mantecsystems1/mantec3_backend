# Diagnóstico de produto e fluxo operacional

> Atualização de 08/11/2026: este diagnóstico registra a baseline da auditoria. As correções posteriores estão no [Lote 1](04-implementacao-lote-1.md) e no [Lote 2 — ficha, assistente e rascunhos](05-implementacao-lote-2.md), com resultados e limites próprios.

Data: **06/11/2026**. Repositórios examinados: backend `D:/Projetos/projetoMantec/BackEnd/MantecBack3.0` (**BE**) e frontend `D:/Projetos/projetoMantec/FrontEnd/FrontMantec2.0` (**FE**). Referências `FE/src/...:linha` e `BE/src/...:linha` usam essas raízes. Os números de linha correspondem ao checkout desta auditoria; o diff distingue o comportamento anterior do lote aplicado.

## Método e limites

**L** = verificado por leitura do código; **E** = executado em teste; **I** = consequência inferida, sem reprodução em navegador; **N** = não executado. Nenhuma observação de balcão ou entrevista com usuários foi feita. Papéis e tarefas foram modelados a partir das permissões, rotas, schemas e serviços. Isso não equivale a pesquisa com pessoas reais.

Foram lidos o relatório anterior, documentação operacional/homologação e histórico recente dos dois projetos. Os HEADs iniciais eram BE `8b7df53` e FE `13590ee`. Havia arquivos não rastreados no backend; eles foram preservados. Não houve instalação de dependências, migração de dados, deploy, envio de mensagem ou operação financeira real. Integrações executadas usaram MongoDB em memória/processo descartável.

O frontend pode executar localmente. Entretanto, o inventário da ferramenta informou que o controle de navegador está desabilitado. Ao selecionar a janela nativa, a ferramenta encerrou a sessão por não conseguir determinar a URL com segurança. **Não houve inspeção visual, capturas, teste por teclado ou simulação real de celular/tablet/desktop.** A fixture `FE/scripts/ux-audit/preview.html` está disponível para reprodução local com componentes reais e dados fictícios, sem API real. Ela não comprova jornada integrada nem autenticação.

## Correções ao diagnóstico anterior

| Hipótese anterior | Resultado da conferência |
|---|---|
| Recebimento composto pode ficar parcial | **Confirmada (L):** `recebimento.service.ts:186` cria o cabeçalho antes dos demais recursos, sem chave idempotente. Não houve simulação de queda no navegador. |
| Wizard é só wrapper | **Confirmada e refinada (L):** o wrapper existe, mas a rota ativa importa diretamente o formulário longo. Alterar apenas o wrapper não resolveria a jornada. |
| Falta ficha conectada | **Parcial:** já há ficha agregada e timeline no portal público (`BE/src/portal-cliente/portal-cliente.service.ts:412`). Falta equivalente interno para a operação. |
| Mensagem preparada gravada como enviada | **Refutada:** já grava `preparada` e audita preparação. O problema era o feedback afirmar abertura; corrigido neste lote. Não há comprovação de envio/entrega. |
| Não existe comprovante de entrega | **Refutada como afirmação geral:** documentos de atendimento/recibo já incluem dados de entrega e assinatura (`BE/src/documentos/documentos.service.ts:145`, `:297`). Falta acesso contextual e conferência na retirada. |
| Cliente listado por ID | **Refutada para ClientesListPage:** já mostra nome/contato. Confirmado fallback de ID integral no seletor de orçamento da OS; encurtado neste lote, sem substituir o protocolo definitivo. |

## Mapa do produto real

React 19, TypeScript, Vite, React Router, Axios e Lucide no FE; NestJS 11, Mongoose/MongoDB, validação de DTO, guards por token/evento, uploads locais/S3 no BE. A árvore ativa parte de `FE/src/app/App.tsx` e usa `FE/src/routes/routes.tsx`. Há **64 padrões de URL, além do fallback**: 59 declarações explícitas e cinco geradas por `recordRoutes`.

| Área/telas | Rotas principais e variações | Objetivo e dependências |
|---|---|---|
| Acesso e portal | `/login`, `/cliente/portal/:token` | Sessão ERP; cliente acompanha, decide orçamento e consulta documentos com token próprio. HTTP público separado. |
| Dashboard | `/` | Resumo de vendas, serviços e pendências; depende de consultas a várias coleções. |
| Empresas/configuração | `/minha-empresa`; `/empresas`, `/empresas/novo`, `/empresas/:id`, `/empresas/:id/editar` | Identidade da empresa e configuração fiscal; gestão da plataforma restrita ao administrador de plataforma. |
| Clientes | `/clientes`, `/clientes/novo`, `/clientes/:id` | Cadastro, endereço e histórico de atendimento/financeiro/comunicação. |
| Recebimentos | `/recebimentos`, `/recebimentos/novo`, `/recebimentos/:id`, `/recebimentos/:id/editar` | Entrada, condições, componentes ausentes, fotos/vídeo, termo e assinatura. A rota de edição mostra detalhe. |
| Orçamentos | `/orcamentos`, `/orcamentos/novo`, `/orcamentos/:id`, `/orcamentos/:id/editar` | Itens produto/serviço, desconto, validade, decisão e geração de OS. Edição também mostra detalhe. |
| OS | `/ordens-servico`, `/ordens-servico/novo`, `/ordens-servico/:id` | Técnico, prioridade, transições, reserva/consumo e retirada. |
| Garantias | `/garantias`, `/garantias/novo`, `/garantias/:id` | Garantia, envio/retorno de fornecedor e crédito, vinculados a venda/produto/cliente. |
| Catálogo | `/catalogo/produtos` e `/catalogo/servicos`, cada um com `/novo`, `/:id`, `/:id/editar`; `/catalogo/compatibilidade` | Peças, serviços, marcas/modelos e compatibilidade. |
| Compras e fornecedor | `/compras`, `/compras/novo`, `/compras/:id`, `/compras/:id/editar`; `/compras/fornecedores` com mesmas variações | Reposição, recebimento e entrada no estoque. |
| Estoque | `/estoque`, `/estoque/movimentos`, `/estoque/movimentos/novo` | Saldo físico, reserva, disponibilidade, ajustes e estornos. |
| Financeiro | `/financeiro`; `/financeiro/vendas`, `/novo`, `/:id`; `/financeiro/pagamentos`, `/novo`, `/:id` | Caixa/fechamento/contas, venda/recibo, recebimento parcial e múltiplos meios. |
| Fiscal | `/fiscal`, `/fiscal/novo`, `/fiscal/:id` | Configuração, pendências cadastrais, simulação/API fiscal e documentos. Simulação não comprova emissão oficial. |
| Usuários | `/usuarios`, `/usuarios/novo`, `/usuarios/:id`, `/usuarios/:id/editar` | Cadastro, papéis e acesso. |
| Comunicação | `/comunicacao/templates`, `/comunicacao/notificacoes`, `/comunicacao/consulta-imei` | Modelos de texto, histórico de preparação e consultas de aparelho. |
| Operação e homologação | `/relatorios/operacional`, `/homologacao/checklist` | Indicadores operacionais e checklist de homologação. |

O menu agrupa **Operação, Clientes, Gestão, Financeiro e Sistema** (`FE/src/constants/navigation.ts`). Atalhos independentes de recebimento/orçamento/OS permitem entrar no meio da jornada. Há links duplicados para cadastrar cliente.

As entidades centrais são Empresa, Usuario, Cliente, RecebimentoEquipamento, CondicoesEquipamento, ComponentesAusentes, MidiasRecebimento, TermosRecebimento, Orcamento/ItensOrcamento, OrdemServico/ItensUtilizadosOS/PecasReservadasOS, Produto/Servico, MovimentoEstoque/SaldoEstoque, PedidoCompra/itens/Fornecedor, Venda/itens/Pagamento, Garantia/envio/retorno/crédito, Notificacao/Template, sessão de portal, auditoria e entidades fiscais/administrativas. Não foi identificado um agregado persistido único de atendimento interno.

API: domínios correspondem aos controllers em `BE/src`; caminhos centrais `/clientes`, `/recebimento-equipamento`, `/condicoes-equipamento`, `/componentes-ausentes`, `/midias-recebimento`, `/termos-recebimento`, `/orcamentos`, `/ordens-servico`, `/estoque`, `/compras`, `/vendas`, `/pagamentos`, `/garantias`, `/portal-cliente` e `/documentos`. As transições possuem endpoints com verbos além de PATCH genérico. Inventários complementares estão em `evidencias/inventario-frontend.md` e `evidencias/inventario-backend.md`.

### Papéis e dependências de autorização

| Papel/tarefa modelada | Capacidade encontrada | Fricção |
|---|---|---|
| Atendente/recebimento | Cliente, entrada e partes de orçamento/OS segundo matriz/eventos | Precisa pedir financeiro a outro papel; ações não autorizadas nem sempre são omitidas/explicadas. |
| Técnico | Consulta e ações técnicas de OS, reservas e consumo | Tela também consulta vendas; erro pode virar ausência e gerar orientação incorreta. |
| Gerente/admin_empresa | Gestão mais ampla e equipe da própria empresa | Definições de atraso, qualidade e exceções não estão centralizadas. |
| Vendas, caixa, financeiro | Venda, recebimentos, fluxo administrativo conforme perfil | Retorno da tela de pagamento vai para lista fixa, perdendo contexto da OS. |
| Estoquista/compras/garantias/fiscal | Operações especializadas por matriz | Estoque/compras não mostram uma fila contínua da peça pendente da OS. |
| Administrador plataforma | Gestão de empresas | Deve continuar distinto de administrador da empresa. |
| Cliente | Portal com sessão revogável e ações limitadas | Situação de retirada e Pix não estão coerentes com fatos por empresa. |

As permissões de área do FE não substituem eventos autorizados pelo BE (`BE/src/permissoes/matriz-permissoes.ts`, guards globais em `app.module.ts`, `FE/src/contexts/providers/PermissionProvider.tsx`). Testes de guard existem, mas não houve navegação autenticada em todos os papéis. Não é possível declarar o produto inteiro isolado por empresa.

### Componentes e design existentes

`GenericListPage`, `GenericRecordPage`, `ResourceForm`, `EmpresaResourceForm`, `AuditTimeline`, layout lateral/topbar, tokens claro/escuro e classes `resource-*` formam a base reutilizável. Máscaras BR e datas de negócio já existem e foram preservadas. `variables.css`/`globals.css` são quase vazios; os tokens efetivos estão em `styles/index.css`.

Código sem consumidor ativo encontrado: árvore legada `src/app/routes.tsx`; `StateGuard` passthrough; placeholders `Breadcrumb`, `OsTimeline`; wrappers `RecebimentoStep*` e `NovoRecebimentoWizard`; flows/stateMachine vazios; páginas `UsuarioPerfisPage`, `LogEventosPage`, `PedidoCompraDetailPage`. Isso é dívida interna; não se afirma que os placeholders estão visíveis ao operador. A timeline real usada é `AuditTimeline`.

## Top 15 — matriz de problemas e critérios de aceite

P0: perda/inconsistência de dados, exposição ou destino financeiro indevido. P1: impedimento/fricção relevante da jornada. P2: eficiência, clareza e acessibilidade. P3: acabamento. Severidade não é estimativa de esforço. “Corrigido” abaixo sempre se limita ao escopo testado no documento 03.

| ID / tela ou fluxo | Objetivo do usuário | Problema e impacto | Evidência / verificação | Severidade | Recomendação e critério de aceite |
|---|---|---|---|---|---|
| F01 OS/orçamento/portal | Trabalhar apenas nos dados da empresa | Vínculos de cliente/aparelho/técnico/orçamento aceitavam IDs de outra empresa; populate podia revelar nome/CPF/IMEI. | L+E: `BE/src/ordens-servico/os.service.ts:36,75,110`; `orcamentos.service.ts:29,68`; integração tenant. | **P0** | Corrigir validação de referências e leituras. **Lote aplicado**; aceitar A→A e negar A→B em criação/edição, sem revelar referência legada de B. Complemento de itens/portal no mesmo lote. |
| F02 estoque | Confiar na quantidade disponível | PATCH/DELETE de movimento altera ledger sem reconciliar SaldoEstoque. Excluir entrada de 2 mostra 0, mas saída de 1 é aceita e mostra -1. | **E:** `evidencias/backend-stock-repro.log`; `BE/src/estoque/estoque.service.ts:37,76,110`. | **P0** | Transação/reconciliação e política de estorno; mesma quantidade no ledger e saldo, com concorrência e rollback comprovados. **Pendente de aprovação estrutural.** |
| F03 portal/Pix | Pagar ao beneficiário correto | Chave e QR são globais, fixos no componente; não derivam da empresa do atendimento. | L; `FE/src/modules/portalCliente/pages/PortalClientePage.tsx:15,482,497`. Nenhum pagamento executado. | **P0 para SaaS** | Configuração por empresa e beneficiário verificável; sem configuração, mostrar indisponibilidade. Exige aprovação de contrato/política. |
| F04 entrada | Salvar fotos/termo sem perder nem duplicar | Cabeçalho é salvo antes de condições/mídias/termo. Falha e repetição podem deixar incompletos/duplicados. | L+I; `FE/src/modules/atendimento/recebimento/recebimento.service.ts:186`; `RecebimentoFormPage.tsx:467`. | **P0** | Operação composta idempotente e rascunho recuperável. Repetir mesma operação retorna o mesmo registro; erro mostra quais anexos faltam. |
| F05 orçamento | Criar proposta coerente com itens | Cabeçalho antes de Promise.all de itens; status avançado no formulário impede inclusão dos itens, editáveis só em rascunho. | L+I; `FE/.../orcamento/pages/OrcamentoFormPage.tsx:179,197,265`; `BE/src/orcamentos/state/orcamento.transitions.ts:45`. | **P0/P1** | Gravar itens/totais com segurança; início em rascunho; recusar criação normal em estado avançado no BE. Atomicidade e política de compatibilidade exigem aprovação. |
| F06 conclusão/entrega | Saber se o aparelho pode ser retirado | OS `concluida` continua igual após assinatura; portal traduz para pronto sem olhar pagamento/entrega. Retirada exige venda paga. | L; `BE/src/portal-cliente/portal-cliente.service.ts:866`; `BE/src/ordens-servico/os.service.ts:162`; `FE/.../PortalClientePage.tsx:212`. | **P1** | Separar fatos técnicos/financeiros/posse. Na **lista interna**, lote já distingue concluída e entregue por dataEntrega. Portal/ficha/estados ainda pendentes. |
| F07 consulta/histórico | Distinguir vazio de falha/sem acesso | getAll de vários serviços captura erro e retorna []; histórico vira zero e OS pode pedir criar venda que já existe. | L+I; `FE/src/modules/financeiro/entities/vendas/vendas.service.ts:44`; `OrdemServicoDetailPage.tsx:122,377`; `ClienteDetailPage.tsx:63`. | **P1** | Estado de consulta com erro/sem acesso/retentativa; consulta indisponível jamais deve virar “não existe venda”. |
| F08 permissões/ações | Executar ações disponíveis ao papel | Botões de venda/pagamento/entrega não usam o mesmo guard de evento das ações técnicas; falha de permissões remota pode deixar loading indefinido. | L; `FE/.../OrdemServicoDetailPage.tsx:454,868`; `PermissionProvider.tsx`; evento global notify sem consumidor. | **P1** | Ação visível/habilitada por evento, motivo e encaminhamento a outro papel. Testar atendente/técnico/gerente/caixa e falha remota, sem ampliar permissão. |
| F09 ficha/assistente | Prosseguir sem conhecer os módulos | Entrada longa, navegação fragmentada e cadastros independentes; diagnóstico ocorre como etapa da OS após orçamento, sem registro técnico estruturado próprio. | L; rotas ativas, `RecebimentoFormPage`, `NovoRecebimentoWizard`, schemas OS/orçamento. | **P1** | Ficha interna agregada e passos reais. Mostrar responsável, pendência, próxima ação e vínculos; não criar segunda OS para orçamento já vinculado. |
| F10 listas/IDs | Encontrar aparelho em segundos | Baseline sem busca/filtros, recebimento sem cliente, OS sem aparelho/técnico; seletor orçamento exibia ObjectId inteiro. Sufixo de 6 não é protocolo único. | L+E; `GenericListPage.tsx`; listas e `OrdemServicoFormPage.tsx:31`. | **P1** | **Lote aplicado**: busca/filtros locais, contexto, nomes, fallback seguro e rótulos. Ainda falta paginação, ordenação e protocolo único no servidor. Aceite definitivo: volume, empresa e colisão testados. |
| F11 pagamento/quitação | Receber centavos e manter saldo correto | Venda aceita statusFinanceiro=pago por POST/PATCH com permissão de gerar venda, sem exigir registrar pagamento; entrega confia nesse estado. Integração de edição/remoção falhou com transação abortada. Input monetário também não tinha step. | L+E: `BE/src/financeiro/vendas/vendas.service.ts:32,149`, matriz perfil vendas; `ResourceForm.tsx:219`, `PagamentoFormPage.tsx:111`; `backend-integration.log`. Bypass de quitação é L, não tentativa em produção. | **P0 financeiro; P1 centavos** | **Step corrigido e testado**; quitação derivada/por evento próprio e investigação da transação exigem plano. Aceite: perfil vendas não pode declarar pago sem recebimento autorizado; parcial, meios distintos e estornos preservam saldo. |
| F12 retirada/exceções | Devolver com ou sem reparo | Exige OS concluída e venda paga, sem percurso próprio para recusa/sem conserto; sem distinção explícita de terceiro e conferência positiva de acessórios. Assinatura pode ser sobrescrita por nova chamada. | L; `os.service.ts:162`, `registrar-entrega-os.dto.ts`; schemas de componentes ausentes. PDFs já existem. | **P1** | Aprovar política de devolução sem cobrança/terceiro; retirada idempotente, conferência e link ao comprovante existente. Não impor exigência legal/documental nova. |
| F13 falha/abandono | Retomar sem recomeçar | Formulário só em memória; condições incompletas são removidas do payload; sem proteção de saída/CAS de dois atendentes. | L+I; `RecebimentoFormPage.tsx:432`; ResourceForm; updates de OS/orçamento leem estado e atualizam sem comparar versão. | **P1** | Erro por linha em vez de descarte; rascunho protegido com anexos pendentes e controle de versão. Testar 401/offline/resposta perdida/duplo clique/conflito. |
| F14 UI/acessibilidade | Ler e usar com teclado/dispositivos distintos | Contrastes baixos, labels não associados em repetidores, canvas só pointer e diálogo câmera sem foco/trap/Escape. Grids inline não usavam classes responsivas. | L+I; `styles/index.css:1471`; `RecebimentoFormPage.tsx:639,943`; detalhes OS/recebimento. | **P2** | Grids ajustados e área de tabela focável/feedback anunciável no lote; restante precisa ensaio visual/a11y. Aceite em 360/768/1280px, teclado e temas conforme WCAG. |
| F15 gestão/volume | Priorizar com informação confiável | Dashboard ignora OS aguardando peça e soma vendas sem definição financeira explícita; coleções completas são carregadas para telas/relatórios. | L; `FE/src/modules/dashboard/dashboard.service.ts:93,111`, serviços getAll. | **P2** | Definir indicadores, mostrar indisponível quando parcial; filas paginadas e prazo/tempo parado com regra aprovada. Não afirmar ganho de desempenho do banco pela busca local. |

Achados adicionais: comunicação já preparada, mas feedback afirmava abertura (**corrigido**, FE `clienteComunicacao.service.ts:8`); notificações permitem estados manuais sem origem de comprovação; endereço ViaCEP pode falhar silenciosamente com preenchimento manual disponível; fornecedor/pedido/previsão não estão conectados à espera por peça; revisão/expiração e cancelamento não têm motivação uniforme; `rejeitado` e `reprovado` são valores distintos com mesmo sentido; criação de OS a partir de orçamento atribui o usuário executor como técnico; exclusão física de recebimento pode deixar vínculos órfãos; formatter genérico pode mostrar JSON/campos internos em outras telas; rota `/editar` sem edição induz expectativa errada. São itens no backlog, não correções declaradas como prontas.

### Acessibilidade e linguagem

Referência consultada: [WCAG 2.2 — W3C](https://www.w3.org/TR/WCAG22/), com foco em 1.3.1, 1.4.3, 1.4.10, 2.1.1, 2.4.7, 2.4.11, 2.5.8, 3.3.1/2 e 4.1.3. Não se declara conformidade AA. Contrastes calculados por luminância sRGB nos valores literais: branco/#10b981 **2,54:1**, branco/#ef4444 **3,76:1**, #344054/#1e2640 **1,43:1**. Aparência efetiva, cascata e estados devem ser examinados no navegador.

Vocabulário proposto: “equipamento” para o item, “atendimento” para a jornada, “orçamento” para a proposta, “serviço concluído” para o término técnico e “entregue” para posse transferida. Não chamar uma preparação de mensagem de envio. Mostrar nomes e protocolo; JSON, hashes e IDs internos pertencem a detalhes técnicos autorizados. Listas do lote usam rótulos, BRL e datas de negócio existentes, mantendo enums de API.

## Nove jornadas modeladas

### J1 Cliente novo e existente

**Atual:** cadastro separado exige nome e CPF/CNPJ; recebimento seleciona cliente por nome/documento em select. Índice único por empresa/documento existe; não há prevenção contextual por telefone. **Ideal:** buscar primeiro por nome/telefone/documento, ver possíveis correspondências e cadastrar no contexto se necessário. Não mesclar automaticamente pessoas com mesmo telefone.

**Campos/decisões:** nome, contato e documento conforme regra existente; eventual flexibilização do documento é decisão comercial. **Próxima ação:** “Continuar com este cliente”. **Responsável:** atendente. **Concluído:** cliente identificado no resumo. **Falhas:** documento duplicado deve oferecer abrir cadastro existente; 403/erro não deve parecer “sem clientes”. Busca da listagem foi testada por SSR/utilitário; criação/duplicata em UI não executada.

### J2 Entrada com avarias, fotos e termo

**Atual:** formulário único com condições, faltantes, câmera/arquivo e assinatura; salva vários recursos e retorna à lista. **Ideal:** Cliente → Equipamento/queixa → Conferência/fotos → Termo → Revisão/protocolo, mantendo rascunho e estado de cada upload. A lista de “componentes ausentes” não substitui acessórios efetivamente recebidos.

**Campos:** aparelho, marca/modelo, identificador quando disponível, relato, avarias, acessórios recebidos/faltantes, evidências e termo. **Próxima ação:** “Confirmar entrada”, depois “Encaminhar para diagnóstico”. **Responsável:** atendente → técnico. **Recuperação:** chave idempotente, rascunho salvo no servidor, revisão de pendências e reenvio apenas do que faltou; nenhuma assinatura reaproveitada para texto alterado sem novo aceite. Não simulado E2E.

### J3 Diagnóstico e orçamento, aprovação/recusa/revisão/expiração

**Atual:** orçamento liga cliente/recebimento, calcula itens e validade, pode ser enviado/aprovado/recusado/cancelado; portal permite decidir e verifica expiração ao decidir. Aprovação interna não tem verificação equivalente de validade; rascunho é o único editável. Revisão versionada não existe. Diagnóstico não tem modelo estruturado suficiente; não presumir que observações genéricas o substituem.

**Ideal:** registrar avaliação/testes → proposta em rascunho → enviar versão → aguardar decisão. **Campos:** defeito encontrado, solução, peças/serviços, valores, validade e prazo estimado aprovado pela empresa. **Próxima ação:** enviar, registrar retorno ou preparar revisão. **Responsáveis:** técnico avalia, atendente comunica, cliente decide. **Falhas/exceções:** envio preparado permanece preparado; rejeição/cancelamento com motivo; orçamento expirado exige nova versão antes de aprovação; alteração de escopo pede nova aprovação. Mudança de regra/versionamento depende de aprovação.

### J4 Execução, técnico e peças

**Atual:** orçamento aprovado pode gerar OS, mas criação independente aceita orçamento opcional e status avançado. OS aberta → diagnóstico → execução, com opção aguardando peça antes da execução. Reserva e consumo são ações diferentes; consumo só em execução. Não há UI clara de troca de técnico/previsão/atraso nem retorno execução→aguardando peça na máquina atual.

**Ideal:** liberar reparo só com autorização válida ou exceção explícita → atribuir técnico → identificar peça/disponibilidade → reservar → executar → registrar consumo/resultado. **Campos:** técnico, prioridade, pendência de peça/pedido/fornecedor/previsão, motivo de atraso. **Próxima ação:** “Reservar peça”, “Solicitar compra” ou “Iniciar reparo”, conforme fatos. **Falhas:** indisponibilidade não deve aparecer só após envio; cancelamento/conclusão com reservas exige política de liberação; dois funcionários não podem consumir a mesma reserva. Concorrência geral do estoque foi testada; sequência reserva→consumo completa não foi validada de ponta a ponta.

### J5 Qualidade, conclusão e pagamento

**Atual:** botão finaliza sem checklist; venda pode importar itens do orçamento, pagamento admite parcial e meios diversos. Entrega exige pago. Existe estorno/edição/remoção no backend financeiro, com uma integração falhando. **Ideal:** registrar testes de qualidade e resultado antes da conclusão; resumo financeiro contextual com total, recebido, saldo e meios. Não alterar política de crédito/entrega a prazo sem decisão.

**Próxima ação:** técnico “Concluir serviço”; financeiro “Registrar recebimento de R$…”. **Concluído:** fatos de qualidade e saldo confirmados. **Responsável:** técnico e caixa, explicitamente distintos. **Falhas:** erro de consulta não é saldo zero; repetição de pagamento precisa idempotência; estorno mantém histórico e recalcula saldo. Marcação de centavos corrigida; a jornada financeira completa não aprovada.

### J6 Aviso, retirada própria ou terceiro e comprovante

**Atual:** prepara WhatsApp/e-mail; nome/documento opcional/assinatura na retirada; PDF agregado e recibo já contêm dados de entrega. Não há seleção explícita de terceiro ou conferência de acessórios. **Ideal:** avisar disponibilidade com situação financeira clara → conferir equipamento/acessórios → identificar recebedor conforme política → revisar e assinar → comprovante contextual → entregue.

**Próxima ação:** “Preparar aviso de retirada”, depois “Registrar retirada”. **Responsável:** atendente/caixa autorizado. **Campos:** quem retira, autorização quando exigida, itens devolvidos, data/responsável e observação. **Falhas:** repetição retorna comprovante existente e não sobrescreve assinatura; documento indisponível oferece retentativa. Política de terceiro/alternativa acessível de assinatura não foi imposta.

### J7 Recusa, sem conserto, não retirada, devolução e reabertura

**Atual:** recusar orçamento/cancelar OS existe; devolver item sem reparo não tem percurso completo de entrega atual; estados terminais não reabrem. Não há política implementada de abandono/prazo/cobrança demonstrada pelo código. **Ideal:** motivo de encerramento independente da posse; devolução sem reparo e eventual taxa expressamente aprovada; retorno em garantia ligado ao histórico, sem reescrever a OS original.

**Próxima ação:** “Combinar devolução” ou “Abrir retorno vinculado”, quando permitido. **Responsável:** atendente, com gerente para exceções. **Pendente:** decidir taxas, prazos, guarda, autorização e se reabre ou cria retorno. Sem decisões não se inventa cobrança ou obrigação documental.

### J8 Permissão, sessão, rede, duplo envio e concorrência

**Atual:** guards e interceptores 401/403 existem; parte das consultas falha como []; campos ficam só em memória; estado lido antes de update não usa versão condicional geral. Botões disabled reduzem clique repetido, mas não garantem idempotência. **Ideal:** estado explícito de acesso/consulta, erro junto ao campo, foco e recuperação, rascunho seguro, chave de operação e comparação de versão. **Próxima ação:** “Entrar novamente”, “Tentar consulta” ou “Revisar atualização do colega”, sem repetir efeitos já confirmados. Testes de guards e isolamento existem; offline/latência/concorrência de atendimento em navegador não executados.

### J9 Alto volume e trabalho diário

**Atual:** cada módulo lista sua coleção, históricos e indicadores fazem consultas amplas; falta responsável/prazo/pendência agregada. **Lote:** nome/telefone na lista clientes, aparelho/cliente nas entradas, aparelho/técnico/prioridade/etapa nas OS, filtros combináveis e URL preservada no histórico do navegador. **Ideal:** fila paginada por empresa, busca indexada, ordenação estável e vistas “Aguardando cliente”, “Peças”, “Em reparo”, “Retirada”. **Próxima ação:** exibida por item, com papel responsável e tempo parado. Critério de segundos/volume depende de dataset representativo; nenhum benchmark foi realizado.

## O que foi aplicado e o que ainda exige decisão

Foram aplicadas correções de vínculos por empresa em escopo delimitado, linguagem de comunicação, contexto/busca/filtros locais, fallback de IDs nas listas tratadas, rótulos de etapa, marcação de centavos e uso das classes de grid responsivo existentes. Não há migração nem novo estado persistido. Evidências e limitações por lote estão no documento 03.

O documento 02 detalha mudanças de contratos/estados/idempotência/protocolo/estoque/Pix e políticas de exceção que precisam de aprovação conforme o pedido. Permanecem lacunas críticas. Esta auditoria **não certifica o produto para lançamento**.
