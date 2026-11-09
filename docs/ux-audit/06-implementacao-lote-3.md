# Lote 3 — orçamento composto e recuperação de envio

Data: 08/11/2026. Continuação autorizada pelo usuário após o [Lote 2](05-implementacao-lote-2.md). Alterações locais nos checkouts BE/FE; nenhum deploy, migração ou acesso a banco existente foi executado.

## Problema resolvido

O formulário de orçamento criava o cabeçalho e depois enviava cada item em chamadas paralelas. Uma falha podia deixar itens faltando ou valores intermediários. Clicar novamente criava outro orçamento. A lista de equipamentos também permitia escolher uma entrada de outro cliente; falhas de consulta podiam aparecer como listas vazias.

O novo percurso grava cabeçalho, itens, totais e auditoria na mesma transação. A tentativa tem uma chave por empresa/operador. Repetir o mesmo envio recupera o orçamento já salvo; alterar o conteúdo com a mesma chave retorna conflito, preservando o registro anterior.

## Experiência implementada

1. Selecionar o cliente; o campo de equipamento mostra somente as entradas dele na empresa, com anexos concluídos.
2. Informar validade, produtos/serviços, quantidades inteiras, valores e desconto. Linhas inválidas não são descartadas silenciosamente. Preço zero é preservado ao selecionar um serviço ou produto.
3. **Salvar orçamento em rascunho.** A tela não pede que o operador declare aprovação/envio antes de salvar os itens. A nova API sempre inicia em rascunho; o envio e a decisão continuam nos comandos já existentes.
4. O sucesso abre o detalhe do orçamento para conferência, em vez de retornar à lista sem contexto.
5. Se a resposta do envio for incerta, os dados enviados ficam bloqueados na mesma tela. O operador pode conferir o orçamento salvo ou repetir exatamente o envio anterior. Um erro definitivo de validação/referência libera a correção dos campos.

As listas de cliente, entrada e catálogo agora usam consultas que propagam falha. Um problema de rede, acesso ou formato impede confirmar com dados incompletos e oferece nova tentativa, mantendo os campos. Erros recebem foco; controles dos itens têm nomes acessíveis por linha. A seleção do cliente limpa a entrada anterior para evitar vínculo acidental.

**Limite importante:** não foi implementado autosave do preenchimento do orçamento antes do primeiro envio. Os campos ainda não enviados permanecem apenas nesta tela, com aviso para salvar antes de sair. Ao recarregar, a chave permite recuperar um orçamento que já tenha sido confirmado no servidor; ela não restaura campos que nunca foram salvos. Não se armazena o formulário ou informações pessoais em sessionStorage/localStorage.

## Contratos e integridade

| Rota | Contrato |
|---|---|
| `POST /orcamentos/completo` | `operacaoId` UUID, `clienteId`, `recebimentoEquipamentoId`, `validade`, `descontos?`, `observacoes?`, `itens[]` com tipo, referência, quantidade e valor unitário. Requer `ORCAMENTO_CRIAR`. |
| `GET /orcamentos/completo/operacoes/:operacaoId` | Recupera resultado da operação da empresa e operador autenticados. Requer `ORCAMENTO_CONSULTAR`. |

Empresa, autor, status inicial, subtotal, total de cada item e total final são definidos no servidor. O novo DTO não aceita totais, autor ou status enviados pelo cliente HTTP. Desconto não pode superar o subtotal; valores negativos, quantidades fracionadas e valores acima do limite numérico são recusados. O comando aceita de 1 a 100 itens.

O serviço verifica referências de cliente, entrada, autor e catálogo na empresa. Também confere que a entrada pertence ao cliente selecionado e não tem anexos pendentes. Os valores usam os helpers existentes de centavos/Decimal128; a auditoria participa da transação pelo contexto de sessão do Mongoose já usado no projeto.

O orçamento recebe campos opcionais privados `operacaoId` e `operacaoHash`. O índice único parcial usa empresa + autor + operação. Os campos privados não aparecem nas consultas comuns. A transação inclui a atribuição da chave, inserção de todos os itens e criação da auditoria. Disputa pelo índice recupera o vencedor quando o conteúdo corresponde; conteúdo diferente recebe409. Não existe fallback de gravação parcial se o comando novo falhar.

O desconto é aplicado depois de todos os itens calculados. Foi testado um orçamento de R$50,05, com desconto de R$15,01 e total de R$35,04, inclusive quando o desconto supera o valor do primeiro item. Isso evita falha intermediária ao recalcular um item por vez.

## Compatibilidade e publicação

Os endpoints CRUD antigos continuam disponíveis. As garantias transacionais descritas valem para o comando novo; não corrigem retroativamente orçamentos antigos nem tornam todas as alterações posteriores de itens atômicas. O novo formulário utiliza somente o comando composto. Publicar o FE contra um BE antigo resulta em erro explícito, sem repetir a sequência antiga.

O script `scripts/recebimento-idempotencia-indexes.cjs` inclui agora o índice parcial de orçamento. Sem `--apply`, imprime o plano sem conexão. Esse modo foi executado e registrado em `evidencias/lote3-indices-plano.json`; nenhum índice foi criado em ambiente existente. A publicação precisa coordenar backend, índice e frontend. Replica set e índice único são pré-requisitos para as garantias de transação/concorrência.

O contrato novo inicia uma proposta em rascunho e preserva os comandos atuais para envio/aprovação. Não foram alterados o endpoint legado de criação, as políticas de validade/revisão, a cobrança, a retirada ou a forma de criar OS. Não houve backfill ou limpeza de registros.

## Validação executada

| Verificação | Resultado |
|---|---|
| BE typecheck, lint:check e build | Aprovados; lint com 0 erros e 19 avisos remanescentes. |
| BE unitários | 33 suítes / **258 testes aprovados**. |
| BE integrações encadeadas | **97 cenários aprovados**, incluindo os 6 novos de orçamento composto. Mongo descartável em replica set. |
| FE typecheck, lint, testes e build | Aprovados; **14 arquivos / 84 testes aprovados**. Build mantém aviso não bloqueante de tamanho de bundle. |

Os seis cenários novos cobrem totais/auditoria/privacidade dos campos da operação, replay concorrente e conteúdo conflitante, rollback com falha de inserção de itens, referência externa/cliente divergente/entrada pendente, escopo de empresa e operador e HTTP com guarda/validação reais. O teste de rollback também verifica que a auditoria não fica órfã. A autenticação HTTP usa fixture; serviços, `PermissionGuard`, validação e banco são reais nesse teste. Isso não equivale a homologação de um ambiente publicado.

Os cinco testes FE novos verificam centavos/desconto, rejeição de itens inválidos em vez de descarte silencioso, valor zero, comando único e propagação de falha sem chamadas legadas. **Não houve homologação visual/interativa deste formulário no navegador neste incremento.** Os testes FE novos exercitam helpers/serviço; não comprovam sozinhos preenchimento, foco ou comportamento com operadores reais. As evidências visuais do Lote 2 continuam restritas às telas e percursos descritos naquele lote.

Logs em `evidencias/lote3-backend-*.log`, `lote3-frontend-*.log` e `lote3-orcamento-integracao.log`. Teste dedicado disponível em `npm run test:orcamento-completo` e incluído no comando de integração geral. Nenhuma dependência nova foi instalada.

## Arquivos principais

- BE: `src/orcamentos/dto/create-orcamento-completo.dto.ts`, `orcamentos.controller.ts`, `orcamentos.service.ts`, `schemas/orcamento.schema.ts`.
- FE: `src/modules/atendimento/orcamento/orcamentoCompleto.ts`, testes e `pages/OrcamentoFormPage.tsx`.
- Validação: `test/orcamento-completo.integration.ts`, script de índices e scripts npm.

## Próximos pontos do plano

A leitura de `gerarOrdemServico` confirmou a verificação seguida de criação, que pode disputar com outra requisição. **A geração concorrente de OS ainda não foi corrigida neste lote.** Sua proteção precisa considerar os vínculos legados antes de introduzir índice de unicidade ou escolher qual registro seria o válido. Não foi deduzida unicidade do equipamento apenas pelo IMEI.

Continuam pendentes: concorrência ao gerar OS/venda, revisão versionada de orçamento e validade uniforme, edição composta, autosave antes do envio, retirada idempotente e decisões D5–D11. A homologação seguinte deve incluir o formulário com dados fictícios no navegador, falha de conexão, retomada após resposta perdida, teclado e execução por perfis diferentes.
