# Lote 8 — acessibilidade de formulários e listas

Data: 08/11/2026. Implementação local no frontend, continuando o [Lote 7](10-implementacao-lote-7.md). Não altera política de atendimento, financeiro ou assinatura.

## Resultado

Os formulários genéricos agora usam identificadores únicos por tela, ligam cada campo ao seu rótulo e ao texto de ajuda, indicam campos obrigatórios de forma compatível com leitor de tela e anunciam a gravação em andamento. Quando ocorre falha ao salvar, a mensagem recebe foco e é anunciada como alerta.

As listas mantêm filtros com rótulos únicos, identificam a tabela como região navegável, marcam cabeçalhos de coluna e dão contexto às ações de ícone, por exemplo “Visualizar clientes”. Botões de linha e de filtro são declarados como botões de ação, evitando envio acidental de formulários. A mensagem de lista vazia respeita se a pessoa pode ou não cadastrar registros.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros ou avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| `git diff --check` | Aprovado; avisos somente de conversão de finais de linha no Windows. |
| Testes automatizados e revisão visual | Não executados neste lote. |

Esse lote melhora a semântica de teclado e leitor de tela nos componentes genéricos. Não constitui certificação WCAG; contraste, zoom, navegação completa por teclado e leitores de tela ainda precisam de avaliação visual/manual em desktop e celular.

## Arquivos principais

- `src/components/ResourceForm.tsx`
- `src/components/GenericListPage.tsx`
- `src/components/operational-list.css` (estilos responsivos existentes permanecem aplicados às listas)

## Próximo passo

Continuar com revisão de navegação e feedback das telas centrais. Decisões D5–D7 ainda impedem alterações de assinatura, qualidade e retirada; filas paginadas dependem de D8.
