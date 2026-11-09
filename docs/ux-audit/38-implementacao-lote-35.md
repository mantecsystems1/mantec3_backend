# Lote 35 — categorias e testes por equipamento

Data: 08/11/2026  
Situação: implementado localmente no backend e frontend; sem publicação ou migração de dados.

## Entrada padronizada

O formulário de recebimento agora pede uma categoria controlada e mantém o campo de descrição livre para a linha do equipamento. As categorias disponíveis são:

- Celular ou smartphone
- Tablet
- Notebook ou laptop
- Computador de mesa
- Outro equipamento eletrônico

A categoria é obrigatória no novo formulário e fica salva no recebimento e em seu rascunho. A API mantém o campo opcional para compatibilidade com clientes antigos. Registros existentes não foram atualizados; detalhes e OS antigas inferem uma categoria quando o tipo livre permite reconhecê-la, senão usam “Outro”. Ao criar a OS, a categoria é copiada para ela para que mudanças posteriores na descrição de entrada não alterem os testes exigidos.

## Checklist da OS

Todas as categorias recebem o checklist-base: liga/desliga, tela/toque, botões, câmeras, áudio/microfone, conexões e carregamento. Também são adicionados estes testes por categoria:

| Categoria | Testes adicionais |
|---|---|
| Celular | SIM e rede móvel |
| Tablet | Rotação e sensores; caneta e acessórios |
| Notebook | Teclado; touchpad; bateria; portas e periféricos |
| Computador de mesa | Portas USB e vídeo; rede cabeada; ventilação e ruído |
| Outro | Nenhum item específico além do checklist-base |

Cada teste adicional aceita “Aprovado”, “Falha” ou “Não se aplica”. Essa última opção cobre recurso inexistente ou indisponível naquele modelo. Falhas continuam exigindo observação; a OS só conclui quando todos os itens da categoria têm resultado e não há falhas.

Os mesmos códigos e regras são validados na API. O salvamento parcial e a correção auditada da OS concluída aceitam somente testes válidos para a categoria registrada. Correções de checklists antigos podem completar os testes específicos que ainda não existiam quando o registro original foi feito, preservando a versão anterior no evento de auditoria.

## Compatibilidade e arquivos

- Backend: `src/common/equipamento-categorias.ts`, `src/recebimento/recebimento-equipamento/dto/create-recebimento-equipamento.dto.ts`, `src/recebimento/recebimento-equipamento/recebimento-equipamento.schema.ts`, `src/recebimento/rascunhos/salvar-rascunho.dto.ts`, `src/ordens-servico/checklist-qualidade.ts`, `src/ordens-servico/os.service.ts` e `src/ordens-servico/schemas/ordem-servico.schema.ts`.
- Frontend: `src/modules/atendimento/equipamentoCategorias.ts`, recebimento/formulário de revisão, `src/modules/atendimento/ordemServico/checklistQualidade.ts`, `pages/OrdemServicoDetailPage.tsx` e ficha de atendimento.
- Plano: [02-plano-implementacao.md](02-plano-implementacao.md).

Não há backfill nem mudança de índices. O fallback por texto livre é somente leitura; novas entradas usam as categorias controladas.

## Validação

| Verificação | Resultado |
|---|---|
| Typecheck backend e frontend | Aprovado |
| Lint backend | Aprovado: 0 erros; 19 avisos existentes |
| Lint frontend | Aprovado |
| Build backend e frontend | Aprovado; chunk principal do frontend com 576,97 kB, acima do aviso de 500 kB |
| `git diff --check` | Aprovado; Git informou conversões de LF para CRLF |

Testes automatizados e conferência manual no navegador não foram executados. Nenhuma migração, backfill ou publicação foi realizada.
