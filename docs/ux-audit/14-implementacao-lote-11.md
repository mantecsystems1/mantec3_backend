# Lote 11 — indicadores sem falsos zeros

Data: 08/11/2026. Implementação local no frontend, continuando o [Lote 10](13-implementacao-lote-10.md). Nenhum deploy ou migração foi executado.

## Resultado

O painel principal e os relatórios operacionais já não tratam falha HTTP, falta de acesso ou resposta de lista inválida como se não houvesse registros. Cada área que não pôde ser consultada aparece como “Indisponível”, com orientação para tentar novamente; as outras áreas carregadas continuam visíveis.

No painel, orçamento aprovado sem OS também fica indisponível se qualquer uma das duas fontes necessárias não puder ser consultada. Valores ausentes ou inválidos de venda não são somados como zero. Os identificadores de clientes sem nome carregado passaram a ser apresentados como “Cliente indisponível”, sem expor a chave técnica.

Nos relatórios operacionais, disponibilidade de estoque, consumo por OS e reservas pendentes são tratados separadamente. Uma falha em uma consulta não apaga resultados das outras nem produz uma mensagem de lista vazia para a área que falhou.

## Limites

- As definições atuais dos indicadores foram preservadas. O cálculo de faturamento, a consideração de OS aguardando peça e o uso de prazo prometido ainda dependem de D11.
- O dashboard ainda agrega listas no navegador; agregação e paginação no servidor permanecem trabalho futuro ligado aos itens 1, 2 e 10.
- Não houve homologação visual no navegador nem validação com respostas reais 401/403, timeout ou payload inválido.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| Testes automatizados e navegador | Não executados neste lote. |

## Arquivos principais

- `src/modules/dashboard/dashboard.service.ts` e `pages/DashboardPage.tsx`.
- `src/modules/relatorios/pages/RelatoriosOperacionaisPage.tsx`.
- `src/services/api/apiList.ts` para validar as respostas de listas.

## Próximo passo

Revisar os textos exibidos e referências de pessoas nos detalhes do fluxo principal, eliminando caracteres corrompidos e chaves técnicas expostas sem introduzir um protocolo comercial antes da decisão D8.
