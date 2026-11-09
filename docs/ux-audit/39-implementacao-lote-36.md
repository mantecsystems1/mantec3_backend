# Lote 36 — PDF técnico por revisão do checklist

Data: 08/11/2026  
Situação: implementado localmente no backend e frontend; sem publicação ou migração.

## Resultado

A ficha da OS passou a listar as revisões auditadas do checklist de qualidade. Cada item mostra número da revisão, situação, quantidade de testes, data e responsável quando identificados, com ação para baixar seu PDF técnico.

O PDF registra a categoria e o equipamento, a revisão selecionada, cada teste e resultado, observações, falhas, responsável, data e justificativa de correção quando houver. Ele é explicitamente separado do comprovante assinado de retirada e não altera a assinatura já registrada.

O arquivo é gerado sob demanda a partir do histórico da OS; o PDF não é armazenado como arquivo. Novas gravações passaram a registrar também os itens do checklist em formato estruturado nos dados do evento de auditoria, preservando os campos legíveis anteriores para compatibilidade com a timeline. Revisões antigas tentam reconstruir os itens a partir dos textos históricos já salvos. Se o evento não estiver disponível, a ficha pode oferecer apenas o retrato atual, com aviso no PDF de que as versões anteriores não foram encontradas.

## Acesso e compatibilidade

- Backend: `GET /documentos/ordens-servico/:id/checklist-qualidade/revisoes` lista as versões e `GET /documentos/ordens-servico/:id/checklist-qualidade/revisoes/:revisao/pdf` gera o documento. Ambos exigem `os.consultar` e restringem OS, auditoria, cliente e responsáveis à empresa do usuário.
- Frontend: a ficha da OS apresenta os comprovantes abaixo do checklist; erro ao buscar revisões não impede a leitura das demais informações e oferece nova tentativa.
- A nova informação estruturada fica dentro de `dados` dos eventos existentes. Não é criada coleção, campo persistido novo ou índice, portanto não há backfill ou migração.
- O termo e a assinatura da retirada continuam sendo documentos separados. O PDF técnico não é uma confirmação do cliente nem uma retificação do comprovante de entrega.

Arquivos principais:

- Backend: `src/ordens-servico/checklist-qualidade-revisoes.ts`, `src/ordens-servico/os.service.ts`, `src/documentos/documentos.controller.ts` e `src/documentos/documentos.service.ts`.
- Frontend: `src/modules/documentos/documentos.service.ts` e `src/modules/atendimento/ordemServico/pages/OrdemServicoDetailPage.tsx`.
- Plano: `02-plano-implementacao.md`.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend e frontend | Aprovado |
| Lint backend | Aprovado: 0 erros e 19 avisos preexistentes em outros arquivos |
| Lint frontend | Aprovado |
| Build backend e frontend | Aprovado; bundle principal do frontend com 579,67 kB, acima do aviso de 500 kB |
| Testes automatizados e navegador | Não executados |

Não foi feita publicação, migração, gravação de PDF em armazenamento externo ou homologação com operadores.
