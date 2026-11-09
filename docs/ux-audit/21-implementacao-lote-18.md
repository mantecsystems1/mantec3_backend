# Lote 18 — navegação lateral sem destaques duplicados

Data: 08/11/2026. Implementação local no frontend, continuando o contexto de navegação do [Lote 10](13-implementacao-lote-10.md). Nenhum deploy ou migração foi executado.

## Resultado

O menu lateral agora compara a rota aberta com as opções liberadas e marca apenas o caminho mais específico como ativo. Em `/clientes/novo`, por exemplo, o sistema destaca “Novo Cliente” sem marcar também “Clientes”. O mesmo vale para formulários de OS, recebimento, estoque e vendas.

O link ativo agora expõe `aria-current="page"`, para que tecnologias assistivas também reconheçam a página atual.

## Limites

- Não houve navegação visual com diferentes perfis ou teclado.
- O inventário de todas as rotas antigas ainda não foi concluído; nenhuma rota adicional foi removida.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| Testes automatizados e navegador | Não executados neste lote. |

## Arquivo principal

- `src/components/layout/Sidebar.tsx`.

## Próximo passo

Conferir a navegação por perfil no navegador e continuar o inventário de rotas antigas. A identidade do cliente nas ações do portal permanece condicionada ao modelo de auditoria.
