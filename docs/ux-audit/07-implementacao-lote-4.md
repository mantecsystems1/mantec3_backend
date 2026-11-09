# Lote 4 — geração de OS e venda sem duplicação

Data: 08/11/2026. Continuação autorizada pelo usuário após o [Lote 3](06-implementacao-lote-3.md). Alterações locais no backend e frontend; nenhum deploy, migração ou acesso a banco existente foi executado.

## Objetivo

Impedir que duas tentativas simultâneas ou uma repetição após falha de rede criem mais de uma ordem de serviço para o mesmo orçamento, ou mais de uma venda para a mesma OS. Preservar dados antigos que já tenham duplicidade, sem escolher ou apagar registros automaticamente, e orientar a conferência quando a repetição não for equivalente.

## Jornada resultante

1. Ao gerar uma OS pelo orçamento, o backend confere na mesma empresa se cliente e equipamento correspondem ao orçamento.
2. A origem é bloqueada dentro da transação antes de consultar/criar a OS. A chamada manual de criação de OS com orçamento e o botão de gerar OS usam a mesma proteção.
3. Se ainda não houver OS, o backend grava OS e auditoria na transação. Se já houver exatamente uma com os mesmos vínculos, devolve a OS existente. Mais de uma OS ou uma OS com vínculos divergentes resulta em `409` com orientação para conferir; nenhum registro antigo é escolhido ou removido.
4. Na venda vinculada a uma OS, o backend valida o cliente e bloqueia a OS na transação. Um replay com o mesmo cliente, totais, desconto e itens devolve a venda existente. Uma venda cancelada, divergente ou várias vendas legadas ligadas à OS resulta em `409` antes de criar outra.
5. Venda, itens, título financeiro e auditoria são gravados de forma transacional. Se um efeito posterior falhar, a transação desfaz a gravação e permite repetir.
6. O formulário impede clique duplo enquanto o envio está em andamento, salva a venda com situação inicial pendente e abre o detalhe após sucesso. A situação financeira é explicada como derivada dos pagamentos, sem oferecer ao operador um seletor que declare manualmente “pago”. Na geração da OS, a mensagem de conflito do servidor é apresentada na tela.

Venda direta continua aceitando vendas independentes sem vínculo com OS. Não foi criada uma regra que impediria uma empresa de ter mais de uma venda direta para o mesmo cliente.

## Proteção e compatibilidade

O helper [`bloquear-origem.ts`](../../src/common/bloquear-origem.ts) faz uma atualização atômica do documento de origem dentro da transação. Isso serializa escritores concorrentes que seguem o mesmo fluxo. Os serviços de OS e venda agora envolvem criação e edição em transação e verificam associações em alterações de vínculos.

Não foi introduzido índice único nem alteração de schema para impor unicidade física. Assim, não há migração necessária neste lote e as duplicatas históricas podem ser identificadas e tratadas com decisão operacional. A proteção concorrente depende de MongoDB configurado como replica set, requisito das transações já utilizadas pelo projeto.

O script [`diagnostico-origens-duplicadas.cjs`](../../scripts/diagnostico-origens-duplicadas.cjs) foi adicionado em modo somente leitura: sem argumento explícito, apenas imprime o plano e não abre conexão. O plano executado está em [`lote4-diagnostico-plano.json`](evidencias/lote4-diagnostico-plano.json). **Não foi feita leitura do banco real.** O modo de leitura exige empresa e nome explícito da variável de conexão, limita cada coleção a 100 grupos duplicados e nunca altera registros.

## Validação

| Verificação | Resultado |
|---|---|
| Backend: typecheck e build | Aprovados. |
| Backend: lint | 0 erros; 19 avisos restantes. |
| Backend: unitários | 33 suítes / **258 testes aprovados**. |
| Backend: integração completa | **105 cenários aprovados**, incluindo geração concorrente, duplicatas legadas, edição de vínculo, rollback e referências entre empresas. |
| Frontend: typecheck e lint | Aprovados. |
| Frontend: testes | **14 arquivos / 84 testes aprovados**. |
| Frontend: build | Aprovado; permanece o aviso de bundle acima de 500 kB. |
| `git diff --check` | Aprovado. |

A integração foi executada com Mongo descartável em replica set. O arquivo de referências entre empresas também passou a usar esse tipo de banco de teste, necessário para os serviços transacionais. Os oito envios concorrentes de geração de OS retornaram o mesmo registro; o mesmo ocorreu para venda, seus itens, título e auditoria. Duplicatas existentes e tentativas com conteúdo diferente foram exercitadas sem excluir nem substituir dados.

Evidências em [`evidencias/`](evidencias/): `lote4-backend-typecheck.log`, `lote4-backend-lint.log`, `lote4-backend-unitarios.log`, `lote4-backend-integracao.log`, `lote4-backend-build.log` e logs de validação do frontend. A suíte dedicada de concorrência e transação está em `lote4-geracao-integracao.log`.

**Limite da validação:** não houve homologação visual ou teste com operadores no navegador neste lote; typecheck/testes/build não comprovam a clareza visual do conflito em todos os perfis ou tamanhos de tela. Também não foi executada uma operação real com dados de cliente.

## Arquivos principais

- Backend: `src/common/bloquear-origem.ts`, `src/ordens-servico/os.service.ts`, `src/orcamentos/orcamentos.service.ts`, `src/financeiro/vendas/vendas.service.ts`.
- Testes: `test/pagamentos-transactions.integration.ts`, `test/tenant-client-references.integration.ts`.
- Frontend: `src/modules/atendimento/orcamento/pages/OrcamentoViewPage.tsx`, `src/modules/financeiro/entities/vendas/pages/VendaFormPage.tsx`.
- Diagnóstico sem alteração: `scripts/diagnostico-origens-duplicadas.cjs`.

## Pendências

O Lote 4 fecha a criação concorrente da OS e da venda por origem. Permanecem pendentes a política aprovada de estados e exceções (D5–D7), revisão versionada de orçamento, edição composta integral, retomada de formulários de venda após resposta incerta, reservas de estoque e retirada idempotente. A inclusão futura de índice único depende de leitura autorizada, conferência das duplicatas e decisão de deduplicação; este lote não faz essa correção em dados existentes.
