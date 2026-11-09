# Lote 38 — busca contextual de cliente no recebimento

Data: 08/11/2026  
Situação: implementado localmente no frontend; sem publicação ou alteração de dados.

## Mudanças

- O passo de seleção do cliente no recebimento agora permite buscar por nome, CPF/CNPJ, telefone ou e-mail.
- A busca ignora acentos e diferenças entre maiúsculas e minúsculas; CPF/CNPJ e telefone também são comparados sem pontuação.
- A tela informa quantos clientes correspondem e mostra uma orientação quando não encontra resultados.
- O cliente já selecionado permanece visível enquanto a pessoa digita uma busca que não o inclui; escolher outro cliente limpa o filtro.
- A lista geral de clientes foi conferida: apresenta nome, e-mail, telefone, cidade e situação, sem uma coluna de ObjectId.

## Limites

A filtragem ocorre no navegador sobre a lista que o recebimento já carrega. Paginação ou busca no servidor pode ser necessária se uma empresa tiver um volume grande de clientes; isso exigiria revisão do contrato aditivo de consulta. Nenhum cliente foi unido, alterado ou desativado.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck do frontend | Aprovado |
| ESLint no formulário alterado | Aprovado |
| `git diff --check` no formulário | Aprovado |
| Testes automatizados e navegador | Não executados nesta etapa |
| Publicação ou alteração de dados | Não executadas |

Plano: [02-plano-implementacao.md](02-plano-implementacao.md).
