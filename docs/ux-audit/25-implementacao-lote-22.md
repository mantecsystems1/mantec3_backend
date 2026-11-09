# Lote 22 — registro fiscal sem números ou tributos fictícios

Data: 08/11/2026. Implementação local no frontend, continuando a humanização das telas fiscais. Nenhum deploy ou migração foi executado.

## Resultado

O formulário fiscal deixou de preencher um número aleatório e passou a pedir o número retornado pelo emissor. O texto agora esclarece que este formulário registra os dados, mas não transmite a NFSe à prefeitura; o botão também passou a dizer “Registrar nota”.

O detalhe da nota não apresenta mais o sufixo do ObjectId como “Código de Verificação”, nem mostra o ID da venda como número comercial. Estados conhecidos recebem rótulos legíveis. Valores ausentes são marcados como indisponíveis. Estimativas de ISS, PIS e COFINS com percentuais fixos foram removidas; a tela orienta consultar o documento fiscal oficial.

## Limites

- Emissão fiscal oficial, validação de XML/PDF, protocolo e cálculo tributário continuam sem integração homologada; nenhuma dessas ações foi criada por este lote.
- Estados desconhecidos aparecem como “Situação não reconhecida”, sem revelar tokens técnicos.
- Não houve inspeção visual no navegador nem teste contra emissor fiscal.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| Testes automatizados e navegador | Não executados neste lote. |

## Arquivos principais

- `src/modules/fiscal/pages/NotaFiscalFormPage.tsx`.
- `src/modules/fiscal/pages/NotaFiscalDetailPage.tsx`.
- `src/modules/fiscal/pages/NotasFiscaisListPage.tsx`.
- `src/modules/fiscal/fiscalDisplay.ts`.

## Próximo passo

Seguir revisando as telas do fluxo para eliminar identificadores usados como dados de negócio e valores derivados sem fonte válida. Emissão oficial e cálculos fiscais exigem integração e regras verificadas antes de serem apresentados como dados reais.
