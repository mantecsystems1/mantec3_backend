# Lote 2 — ficha do atendimento, recebimento por etapas e rascunhos

> Continuação: o [Lote 3](06-implementacao-lote-3.md) acrescentou a criação composta do orçamento e recuperação de envio. Este arquivo preserva o fechamento do Lote 2.

Data: 08/11/2026. Continuação local do [Lote 1](04-implementacao-lote-1.md), autorizada pelo pedido de continuidade do usuário. Repositórios: backend `D:/Projetos/projetoMantec/BackEnd/MantecBack3.0` e frontend `D:/Projetos/projetoMantec/FrontEnd/FrontMantec2.0`.

**Resultado:** o recebimento passa por cinco etapas e termina na ficha interna do atendimento. A ficha reúne os vínculos existentes, mostra a próxima ação e separa a situação da entrada, do orçamento, do reparo, do financeiro e da entrega. O preenchimento ganha salvamento automático no servidor e retomada com controle de versão. São alterações locais; não houve publicação, alteração de banco existente nem migração executada.

## Mudanças percebidas por quem atende

| Situação | Comportamento implementado |
|---|---|
| Registrar a entrada | Cinco etapas: Cliente → Equipamento e relato → Conferência e fotos → Termo → Revisão. Apenas a etapa atual aparece; o operador pode voltar para conferir. |
| Encontrar erro no preenchimento | Validação da etapa, resumo de erros com foco e acesso ao campo. Antes da confirmação, o fluxo verifica novamente os dados necessários. |
| Conferir antes do aceite | Na etapa do termo há uma revisão expansível de cliente, equipamento e condições. A revisão final apresenta também faltantes, fotos e situação da assinatura. |
| Trocar de etapa com fotos ou assinatura preenchida | Os campos permanecem montados, preservando os arquivos e o desenho durante a sessão. A câmera é encerrada ao sair da etapa de mídia. |
| Interromper o preenchimento | O servidor salva os campos e a etapa; a interface informa salvamento, falha ou conflito. “Salvar e sair” aguarda o salvamento. Há ação para salvar o rascunho e começar outra entrada. |
| Abrir o mesmo rascunho em duas abas | Uma revisão desatualizada recebe conflito. A interface orienta recarregar a versão salva e avisa que isso substitui os campos atuais; não sobrescreve silenciosamente a outra aba. |
| Reabrir o rascunho | Recupera campos e etapa do próprio operador na própria empresa. Arquivos precisam ser selecionados novamente; assinatura e aceite precisam de nova coleta. |
| Confirmar a entrada | Utiliza o comando composto do Lote 1 e abre `/atendimentos/:recebimentoId`. Falhas de anexos continuam no percurso de retomada, sem novo cabeçalho. |
| Abrir um recebimento na listagem | O botão de visualizar abre a ficha. O registro original de entrada e suas evidências continuam acessíveis pelos atalhos autorizados. |
| Entender onde o equipamento está no fluxo | A ficha mostra cinco situações separadas, próxima ação, responsável, pendências, registros relacionados e histórico recente. Serviço concluído não significa entrega registrada. |
| Consultar dados com acesso limitado ou erro | “Sem acesso”, “dados indisponíveis” e “nenhum registro” são estados distintos. Não se mostra saldo zero por falta de permissão ou falha na consulta. |
| Voltar à lista de origem | A ficha conserva a busca e os filtros da URL. Links nos detalhes de entrada, orçamento e OS permitem voltar ao atendimento. Venda aberta pela ficha também mantém esse contexto. |
| Ler identificadores | Nomes e descrições ocupam o lugar dos IDs nas informações de pessoa/equipamento. A ficha identifica os sufixos como referências legadas; não foi criado protocolo sequencial nem garantida unicidade desses sufixos. Venda também usa referência curta no título e na origem. |

## Ficha interna: projeção de leitura

Contrato aditivo implementado: `GET /atendimentos/:recebimentoId`. O parâmetro identifica a entrada, não apenas um aparelho pelo IMEI. O agregador não cria outra fonte de verdade para estoque, OS ou pagamentos e não modifica seus estados persistidos.

O retorno contém cliente, equipamento, responsáveis, cinco eixos de situação, orçamentos, ordens, vendas, histórico, pendências e ações permitidas. Cada seção de registros tem um dos estados abaixo:

```text
{ estado: disponivel, itens: [...] }
{ estado: sem_acesso, mensagem: ... }
{ estado: indisponivel, mensagem: ... }
```

A ausência de uma venda consultável não equivale a quitação. Vínculos são conferidos por empresa, entrada e cliente antes da composição. Um registro inconsistente gera orientação de revisão, sem reparentear ou corrigir dados automaticamente. Uma falha ao consultar o orçamento também torna indisponível uma OS que depende desse vínculo para ser validada.

A ficha exige `RECEBIMENTO_CONSULTAR`. As seções e consultas respeitam os eventos de negócio do papel autenticado. O backend não consulta venda, pagamentos ou caixa para perfis sem os eventos necessários. Ações são somente destinos de navegação; os comandos existentes continuam responsáveis por sua própria autorização. No frontend, os atalhos também respeitam a permissão da tela de destino, evitando links bloqueados pelo guard de interface.

O histórico contém até **100 eventos recentes**, filtrados pelos domínios acessíveis, com data/hora, título e ator resolvido na empresa. Não entrega o objeto bruto de auditoria, documentos pessoais, imagens de assinatura, hashes ou metadados desnecessários. Ator sem vínculo seguro aparece como “Equipe”. A ficha oferece acesso aos registros que já possuem os documentos; não foi criado download agregado novo de PDFs.

O financeiro utiliza a mesma função de pagamentos válidos do Lote 1, com total pago e saldo calculados em centavos. A leitura também contempla uma fixture de compatibilidade para venda antiga com origem em orçamento, desde que todos os vínculos sejam seguros. Esse caso gera **conferência do vínculo**, sem sugerir nova venda ou liberar a retirada como se fosse uma venda da OS quitada. A API atual continua recusando novas vendas com origem em orçamento. Não foi consultado banco real para afirmar que esse legado existe em produção.

Estados múltiplos permanecem visíveis: mais de uma OS ou venda exige conferir cada registro. A ficha não escolhe automaticamente uma política de unicidade, revisão de orçamento ou cancelamento. Para ordem cancelada/recusa, orienta combinar a continuidade ou devolução conforme a política existente, sem criar uma nova regra comercial.

Arquivos centrais:

- BE: `src/atendimentos/atendimentos.service.ts`, controller, módulo, tipos e teste; registro no `src/app.module.ts`.
- FE: `src/modules/atendimento/ficha/`, rota em `src/routes/routes.tsx`, links nos detalhes e visualização na lista de recebimentos.
- FE: o contrato recebido é validado antes da renderização, inclusive campos opcionais; respostas incompatíveis não viram listas vazias ou valores monetários presumidos.

## Rascunho: salvamento antes da entrada definitiva

| Método / rota | Uso e autorização |
|---|---|
| `GET /rascunhos-recebimento` | Até 50 rascunhos recentes do operador na empresa; requer consulta de recebimento. A listagem contém equipamento, etapa e atualização, sem o formulário completo. |
| `GET /rascunhos-recebimento/:operacaoId` | Retoma o rascunho do mesmo escopo; requer consulta de recebimento. |
| `PUT /rascunhos-recebimento/:operacaoId` | Salva `{ revisaoEsperada, dados }`; requer criação de recebimento. Aceita preenchimento parcial. |
| `POST /recebimento-equipamento/completo` | Contrato do Lote 1 acrescido de `rascunhoRevisao` opcional. Quando existe rascunho salvo, a revisão deve corresponder à versão atual. |

A coleção nova é `rascunhosRecebimento`. A chave única é empresa + operador + operação UUID. O campo `revisao` protege a atualização contra sobrescrita entre abas. Repetição do mesmo conteúdo após perda de resposta pode recuperar a revisão confirmada, sem gerar outra versão desnecessária. O frontend serializa as gravações e aguarda a fila antes de confirmar a entrada.

O payload tem allowlist, limites de tamanho e validação de referências. Pode guardar campos de cliente/equipamento/relato, condições, faltantes, texto do termo e metadados de mídia. **Não salva os arquivos, a imagem da assinatura nem o aceite no rascunho.** Esses dados permanecem na sessão até o comando final. Nome/documento preenchidos no formulário ficam no servidor, protegidos pelo escopo; não são gravados em localStorage/sessionStorage. O navegador conserva somente a chave da operação, e a URL também permite recuperação.

A revisão é conferida e o rascunho é marcado como convertido **na mesma transação** que cria a entrada, condições, faltantes, termo e auditoria. O rascunho convertido aponta para o recebimento, deixa de aceitar edição e não mantém uma segunda cópia do formulário. A consulta de operação também reconhece entradas do comando composto anterior à introdução dos rascunhos.

Não há TTL, expiração, exclusão automática ou compartilhamento de rascunho entre operadores. A regra de retenção e eventual limpeza continua pendente de definição; não foi inferida autorização para apagar registros.

Arquivos centrais: `src/recebimento/rascunhos/`, `recebimento-completo.service.ts` e seu DTO; FE `rascunhoRecebimento.service.ts`, `recebimentoDraftWriter.ts` e integração no formulário ativo.

## Verificações e evidências

Os comandos finais e códigos de saída estão em `evidencias/lote2-backend-checks.json` e `lote2-frontend-checks.json`; logs seguem o prefixo `lote2-final-`. A validação usa as dependências locais, sem ler credenciais ou URI de banco existente.

| Verificação | Resultado |
|---|---|
| FE typecheck / ESLint / build | Aprovados. Build mantém aviso de tamanho do bundle principal; não bloqueou a compilação. |
| FE Vitest | **13 arquivos, 79 testes aprovados.** Inclui ficha, navegação segura, preservação de filtros, respostas inválidas, etapas, revisão, fila de rascunho, retomada e falhas de cliente. |
| BE typecheck / lint:check / build | Aprovados; lint com 0 erros e 19 avisos remanescentes. |
| BE Jest | **33 suítes, 258 testes aprovados.** |
| BE E2E existentes | **2 suítes, 5 testes aprovados**, com mocks em parte do percurso; não comprovam uma implantação completa. |
| Integrações Mongo descartável | **91 cenários distintos aprovados**: 64 regressões do Lote 1, 13 da ficha e 14 de rascunho. O comando encadeado passou 90; após a correção da opção `critica`, a suíte de rascunho foi revalidada com 14/14, substituindo os 13 anteriores. Typecheck/lint focados passaram e o build foi repetido após essa correção. |

As integrações novas exercitam controller HTTP, `ValidationPipe`, `PermissionGuard`, serviços reais e MongoDB descartável em replica set. A autenticação é uma fixture de teste; não foi usado login/credencial real. Cobrem A/B, operador externo, perfil técnico sem consulta financeira, vínculos legados inválidos, falhas parciais, eventos sanitizados, pagamentos válidos, concorrência de revisões, replay e rollback/conversão na transação.

### Verificação no navegador

Foi usada a página local `scripts/ux-audit/preview.html`, com componentes reais do produto e adaptador de API contendo somente dados fictícios. O adaptador intercepta as chamadas dessa fixture; a confirmação simulada não grava uma entrada em banco real.

| Percurso observado | Resultado e limite |
|---|---|
| Ficha em desktop | Parte superior conferida visualmente. Cliente, próximo passo, responsável e eixos legíveis. A captura preservada registra a falha simulada de conexão com os dados anteriores mantidos. |
| Atualização da ficha com conexão simulada indisponível | Dados anteriores mantidos, mensagem de erro visível, atalhos desativados; restaurar conexão e tentar novamente reativou os atalhos. |
| Etapa Cliente vazia → continuar | Resumo de erro com foco; seleção do cliente permitiu avançar. |
| Percorrer as cinco etapas e voltar para editar | Campos mantidos, títulos/foco acompanharam a etapa, revisão exibiu o conteúdo preenchido. |
| Conflito simulado de revisão → recarregar | Aviso explícito de alteração em outra sessão; recarregar trouxe a versão salva e removeu o bloqueio. |
| Revisão sem assinatura → confirmar | Navegou para o componente real da ficha. O retorno da API era sintético; não é prova de persistência integrada de produção. |
| Layout a 390 px de largura CSS | Entrada e ficha sem extravasamento horizontal nas etapas verificadas. A ficha redistribuiu os eixos em duas colunas e os cartões em uma. |

Evidências preservadas: `lote2-ficha-desktop.jpg` (falha simulada com dados mantidos), `lote2-wizard-revisao-ax.txt`, `lote2-ficha-apos-confirmacao-ax.txt` e `lote2-ficha-390-layout.json`. A captura desktop foi salva antes de um timeout na chamada seguinte. As tentativas posteriores de imagem, incluindo mobile, falharam com timeout de `Page.captureScreenshot`. As evidências AX e medidas de DOM não substituem uma revisão visual completa em todos os tamanhos/temas.

![Ficha desktop com falha de conexão simulada e dados fictícios preservados](evidencias/lote2-ficha-desktop.jpg)

**Ainda não homologados:** câmera real e permissões de mídia, seleção real de fotos/vídeos no navegador, desenho de assinatura por toque, tema escuro, leitores de tela e acessibilidade completa. Não se declara conformidade WCAG. A retomada e integridade de arquivos contam com os testes automatizados do Lote 1; não foram repetidas com arquivos pessoais na interface.

## Publicação e compatibilidade

Não houve deploy. A rota ativa do recebimento no frontend agora utiliza o assistente e o autosave; publicar somente o frontend contra backend antigo causa erro explícito. Não existe fallback silencioso para a sequência de gravações antiga. A publicação precisa coordenar backend, índices e frontend, em homologação antes de produção.

`scripts/recebimento-idempotencia-indexes.cjs` foi ampliado com os índices da coleção de rascunhos. Sem argumentos, apenas imprime o plano **sem conexão**; esse modo foi verificado. O modo `--apply --uri-env NOME_DA_VARIAVEL` continua reservado ao ambiente aprovado e não foi executado. O script cria índices aditivos e não remove índices ou registros. Índices únicos e replica set são pré-requisitos para a concorrência/transação descritas.

Nenhuma dependência nova foi instalada. As alterações existentes do usuário foram preservadas. Não foram executados commit, push, merge, publicação ou correção em massa de dados. Os endpoints anteriores continuam disponíveis; clientes antigos não recebem automaticamente a experiência do assistente nem suas garantias de rascunho.

## Continuidade do plano

Este lote implementa a **projeção de leitura** do item 7 e o assistente do item 8, estendendo D4 com rascunhos. D5 não foi encerrada como política de cardinalidade ou estado persistido. Também não encerra os demais achados da auditoria.

Próximos incrementos indicados no [plano](02-plano-implementacao.md):

1. Orçamento composto recuperável e concorrência ao gerar OS/venda, com regra explícita para revisões e múltiplos registros.
2. Retirada idempotente e comprovante preservado, acompanhados das decisões sobre devolução sem reparo, recebedor e qualidade.
3. Busca/paginação no servidor, protocolo legível e único e cadastro de cliente no contexto do atendimento.
4. Revisão transversal do fallback de permissões, comunicação comprovável e indicadores por definição aprovada.
5. Homologação com operadores e dispositivos reais, incluindo câmera, teclado, leitor de tela e assinatura por toque.

As decisões comerciais/legais D5–D11, a retenção dos rascunhos e mudanças destrutivas de dados permanecem registradas para decisão específica; não foram resolvidas por suposição neste incremento.
