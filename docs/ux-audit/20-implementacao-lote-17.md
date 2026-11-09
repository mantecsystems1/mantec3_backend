# Lote 17 — linha do tempo legível

Data: 08/11/2026. Implementação local no frontend, continuando a rastreabilidade dos [Lotes 15 e 16](19-implementacao-lote-16.md). Nenhum deploy ou migração foi executado.

## Resultado

A linha do tempo de auditoria mostra os detalhes com rótulos em português, traduz operações e estados, formata valores monetários e oculta campos que terminam em `Id`. Chaves como item e venda de destino não são exibidas para quem consulta o histórico.

Eventos de venda e itens agora têm nomes claros. Quando o usuário responsável não pôde ser carregado, a tela mostra “Usuário indisponível” ou “Usuário não identificado”, sem exibir o ObjectId como nome. Falhas na consulta do histórico permitem nova tentativa.

## Limites

- A tela não foi conferida visualmente com dados de uma auditoria real.
- A forma como o portal registra a pessoa cliente continua pendente; o schema atual exige um usuário interno.
- Não houve teste com respostas 401, 403 ou falhas de rede.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| Testes automatizados e navegador | Não executados neste lote. |

## Arquivo principal

- `src/modules/auditoria/components/AuditTimeline.tsx`.

## Próximo passo

Revisar os metadados que aparecem para outras operações financeiras e validar em navegador que o destaque da navegação reflete a página aberta em rotas antigas e novas.
