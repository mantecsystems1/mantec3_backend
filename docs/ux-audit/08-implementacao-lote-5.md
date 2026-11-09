# Lote 5 — recuperação idempotente do envio de venda

Data: 08/11/2026. Continuação autorizada após o [Lote 4](07-implementacao-lote-4.md). Implementação local no backend e frontend. Nenhum deploy, migração ou acesso a banco existente foi executado.

## Problema e resultado

O formulário já bloqueava clique duplo e o backend já evitava vendas repetidas para uma mesma OS. Ainda faltava recuperar uma venda direta quando o servidor concluía a gravação, mas a resposta não chegava ao navegador. Depois de atualizar a página ou repetir o envio, a venda direta poderia ser criada novamente.

Agora cada tentativa tem um UUID por empresa. O backend registra, na mesma transação da venda, o vínculo entre a operação e a venda. Repetir a mesma chave e o mesmo conteúdo retorna a venda salva; reutilizar a chave com conteúdo diferente retorna `409`. O resultado de uma operação pode ser consultado após recarregar a página.

## Jornada implementada

1. Ao abrir o formulário, o frontend cria ou reutiliza um UUID e o mantém no endereço da página. O endereço preserva a tentativa após recarregar, sem salvar cliente, itens ou valores no navegador.
2. A tela consulta a operação. Se a venda já foi salva, abre o detalhe existente; se ainda não existe, permite preencher e enviar.
3. O novo comando aceita cliente, origem, desconto e itens. O servidor calcula subtotal, total e situação inicial; o formulário não declara totais nem situação paga.
4. Venda, itens, título financeiro, auditoria e vínculo da operação são confirmados na mesma transação. A falha de qualquer etapa não deixa venda ou operação incompleta.
5. Se a resposta for incerta, a tela preserva os campos enquanto fica aberta, impede alterações até a conferência e oferece “Verificar venda salva”. Uma repetição usa a mesma chave. Ao encontrar a venda, navega para o detalhe.

## Contrato e proteção dos dados

| Rota | Uso |
|---|---|
| `POST /vendas/completo` | Cria ou recupera a venda da tentativa. Recebe `operacaoId`, `clienteId`, `origemTipo`, `origemId`, `descontos?` e 1–100 itens. Requer `VENDA_GERAR`. |
| `GET /vendas/completo/operacoes/:operacaoId` | Recupera a venda da tentativa dentro da empresa autenticada. Requer `VENDA_CONSULTAR`. |

O DTO rejeita campos adicionais, totais, autor e situação enviados pelo navegador. O backend calcula os valores em centavos e valida empresa/cliente, produto ou serviço e origem. Conteúdo idêntico normalizado é reconhecido por hash; conteúdo diferente com a mesma chave resulta em conflito.

A coleção auxiliar `operacoesVendas` guarda empresa, operador que iniciou, UUID, hash privado e ID da venda. A chave única planejada é empresa + UUID. O escopo por empresa permite recuperar a venda mesmo se outro operador da mesma empresa retomar a tela; o endpoint continua exigindo autenticação, permissão de consulta e vínculo da empresa. O hash não é retornado em consultas normais.

O índice aditivo está no script [`recebimento-idempotencia-indexes.cjs`](../../scripts/recebimento-idempotencia-indexes.cjs); o plano sem conexão foi salvo em [`lote5-indices-plano.json`](evidencias/lote5-indices-plano.json). **O índice não foi aplicado em banco existente.** Ele deve ser criado antes de publicar o novo comando. O endpoint legado `/vendas` continua disponível para consumidores atuais; o formulário novo usa apenas o comando composto, sem fallback de gravação parcial.

Os registros de operação não têm expiração automática. Não armazenam os dados pessoais e financeiros da solicitação, mas crescem com as tentativas confirmadas; uma política de retenção poderá ser definida separadamente sem perder a janela de recuperação necessária.

## Validação

| Verificação | Resultado |
|---|---|
| Backend: typecheck e build | Aprovados. |
| Backend: lint | 0 erros; 19 avisos restantes. |
| Backend: unitários | 33 suítes / **258 testes aprovados**. |
| Backend: integração completa | **107 cenários aprovados** em Mongo descartável com replica set. |
| Frontend: typecheck e lint | Aprovados. |
| Frontend: testes | **14 arquivos / 84 testes aprovados**. |
| Frontend: build | Aprovado; aviso de bundle acima de 500 kB permanece. |
| `git diff --check` | Aprovado nos dois repositórios. |

Os testes de integração cobrem oito chamadas concorrentes com a mesma chave, recuperação do mesmo registro, conteúdo diferente com conflito, recuperação por outro operador da mesma empresa, isolamento entre empresas, reaproveitamento de venda já ligada a OS e rollback do vínculo da operação quando a sincronização financeira falha. Os demais cenários dos Lotes 1–4 continuam dentro da execução integrada.

Evidências em `evidencias/lote5-backend-*.log`, `evidencias/lote5-frontend-*.log` e `evidencias/lote5-indices-plano.json`. Os novos cenários estão na suíte `test/pagamentos-transactions.integration.ts`.

**Limites:** a chave recupera tentativas confirmadas; se a venda ainda não chegou a ser gravada e a página foi recarregada, os campos precisam ser preenchidos novamente. Typecheck, testes e build não substituem teste interativo de timeout/recarga no navegador. O endpoint novo foi exercitado pelo serviço com Mongo descartável; não foi feita homologação HTTP visual com perfis nem operação com clientes reais.

## Arquivos principais

- Backend: `src/financeiro/vendas/dto/create-venda-completa.dto.ts`, `schemas/operacao-venda.schema.ts`, `vendas.controller.ts`, `vendas.module.ts`, `vendas.service.ts`.
- Frontend: `src/modules/financeiro/entities/vendas/vendas.service.ts` e `pages/VendaFormPage.tsx`.
- Integração e índice: `test/pagamentos-transactions.integration.ts`, `test/tenant-client-references.integration.ts`, `scripts/recebimento-idempotencia-indexes.cjs`.

## Próximos pontos

Continuam pendentes as decisões D5–D7 sobre estados, exceções, devolução e comprovante; revisão versionada de orçamento; edição composta integral; lifecycle de reserva de estoque; e retirada idempotente. A publicação deste lote precisa coordenar o índice `operacoesVendas`, backend e frontend. Não aplique o índice sem conferir o ambiente de destino e a janela de publicação.
