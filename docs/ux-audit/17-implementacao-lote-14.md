# Lote 14 — referências legadas identificadas

Data: 08/11/2026. Implementação local no frontend, continuando os [Lotes 12 e 13](16-implementacao-lote-13.md). Nenhum deploy ou migração foi executado.

## Resultado

Nas listas de OS e orçamento, o sufixo curto do ObjectId passou a ser chamado de “Referência legada”, em vez de “Código”. As telas de detalhe agora identificam essa referência separadamente do título “Ordem de serviço” ou “Orçamento”. No dashboard, o mesmo campo é apresentado como referência da OS/orçamento.

Isso mantém uma forma temporária de localizar registros antigos sem sugerir que exista um protocolo oficial, único ou sequencial. O ID completo continua somente na navegação interna.

## Limites

- Não foi criado protocolo. A numeração empresarial por empresa/ano/tipo continua dependente da decisão D8, com índice e plano de compatibilidade.
- Mensagens e outros módulos ainda podem incluir referências curtas legadas; devem ser revisados junto com a decisão de protocolo para que equipe e cliente recebam o mesmo código.
- Não houve avaliação visual em navegador.

## Validação

| Verificação | Resultado |
|---|---|
| Frontend: typecheck | Aprovado. |
| Frontend: lint | Aprovado, sem erros nem avisos novos. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| `git diff --check` | Aprovado; avisos apenas de conversão de finais de linha no Windows. |
| Testes automatizados e navegação visual | Não executados neste lote. |

## Arquivos principais

- `src/modules/atendimento/ordemServico/pages/OrdensServicoListPage.tsx` e `OrdemServicoDetailPage.tsx`.
- `src/modules/atendimento/orcamento/pages/OrcamentosListPage.tsx` e `OrcamentoViewPage.tsx`.
- `src/modules/dashboard/pages/DashboardPage.tsx`.

## Próximo passo

Definir uma convenção única e segura para comunicar referências de OS e orçamento após a decisão D8. Antes disso, é possível continuar a revisão técnica de legibilidade e verificar referências residuais em mensagens de cliente sem mudar o contrato dos registros.
