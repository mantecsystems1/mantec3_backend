# Relatório de avaliação do fluxo operacional

> Histórico: este relatório descreve a avaliação original. A implementação posterior e suas validações estão no [Lote 1](ux-audit/04-implementacao-lote-1.md) e no [Lote 2 — ficha, assistente e rascunhos](ux-audit/05-implementacao-lote-2.md).

**Escopo:** entrada de equipamento para reparo até a retirada pelo cliente  
**Data:** 5 de novembro de 2026  
**Fontes:** backend `MantecBack3.0` e frontend `FrontMantec2.0` (checkout irmão documentado em `PLANO_IMPLEMENTACAO.md`).  
**Tipo de avaliação:** leitura de código e regras existentes; nenhuma alteração de produto foi aplicada.

## Resumo executivo

O projeto já contém os blocos necessários para atender um reparo: cadastro do recebimento, registro de condições/fotos/termo, orçamento, aprovação, ordem de serviço, reserva/consumo de peças, venda, pagamento, assinatura de entrega e comunicação. Há também transições de estado e trilha de auditoria em partes importantes.

O maior problema de usabilidade é que esses blocos ainda parecem módulos próximos, mas não um único atendimento contínuo. Existem rotas de criação manual que permitem começar etapas fora da sequência, cadastros vinculados por chamadas separadas e estados que não deixam claro se o item está em reparo, pronto para retirada ou efetivamente entregue. O usuário precisa conhecer os nomes dos módulos e os vínculos entre eles para completar o trabalho.

**Prioridades recomendadas:**

1. Fazer o recebimento ser o início guiado do atendimento e garantir salvamento consistente do registro completo.
2. Apresentar uma linha do tempo única por equipamento/atendimento, com próxima ação clara e pendências.
3. Diferenciar “serviço concluído”, “aguardando pagamento”, “pronto para retirada” e “entregue”.
4. Evitar criar registros a partir de IDs internos ou permitir avanço de estado fora do fluxo esperado.
5. Melhorar as listas para trabalho diário: busca, filtros, ordenação, paginação e contexto de cliente/equipamento.

## Fluxo atual identificado

```text
Cliente e equipamento recebidos
  → registrar condições, componentes ausentes, mídias e termo
  → criar orçamento em rascunho
  → enviar ao cliente e registrar aprovação/reprovação
  → gerar OS a partir do orçamento aprovado
  → diagnóstico
      ↘ aguardando peça ↗
  → execução e consumo de peças
  → concluir OS
  → gerar venda vinculada
  → registrar pagamento total
  → colher assinatura e registrar retirada
```

O fluxo é montado entre `/recebimento-equipamento`, `/orcamentos`, `/ordens-servico`, vendas e pagamentos. O caminho mais conectado existe: a página do recebimento permite iniciar um orçamento, e o orçamento aprovado permite gerar uma OS. Porém, há também formulários e ações independentes para criar OS/orçamento, e não existe uma visão central que mostre todos os passos e suas pendências.

## Achados detalhados

### 1. Salvamento do recebimento pode deixar dados pela metade — **Alta**

O formulário envia primeiro o recebimento e depois grava condições, componentes ausentes, mídias e termo em chamadas separadas. Se uma etapa falhar depois da criação inicial, o recebimento permanece salvo sem todo o conteúdo; a tela mostra erro e uma nova tentativa pode criar outro recebimento. Não há compensação/rollback nem retomada explícita do que faltou. Isso é especialmente delicado para fotos e assinatura, que documentam o estado de entrada.

**Recomendação:** criar uma operação de backend para receber o conjunto completo em uma única transação/unidade de trabalho; se armazenamento de arquivo impedir atomicidade total, usar estado “rascunho/incompleto”, retentativa idempotente e checklist visível. Após salvar, mostrar protocolo e permitir continuar do ponto incompleto.

**Referências:** `FrontEnd/FrontMantec2.0/src/modules/atendimento/recebimento/recebimento.service.ts` (`createCompleto`); backend `src/recebimento/recebimento-equipamento/recebimento-equipamento.service.ts`.

### 2. O “wizard” de entrada não é um assistente por etapas — **Alta**

`NovoRecebimentoWizard` apenas renderiza `RecebimentoFormPage`. A página concentra cliente, equipamento, estado, condições, itens faltantes, mídias e termo/assinatura em um formulário extenso. Isso exige rolagem e deixa difícil saber o que já foi preenchido ou o que falta antes de confirmar. Além disso, o status é selecionável pelo atendente logo na entrada, embora as opções seguintes dependam do trabalho real feito no reparo.

**Recomendação:** dividir em passos curtos com indicador de progresso e resumo fixo: (1) cliente, (2) equipamento e conferência visual, (3) acessórios/avarias e fotos, (4) termo e assinatura, (5) revisão e protocolo. O status inicial deve ser automático; a progressão deve acontecer por ações nomeadas, com validações e explicações.

**Referências:** `FrontEnd/FrontMantec2.0/src/modules/atendimento/recebimento/pages/NovoRecebimentoWizard.tsx` e `RecebimentoFormPage.tsx`.

### 3. Recebimento, orçamento e OS não formam uma ficha única — **Alta**

O detalhe do recebimento oferece “Gerar Orçamento”, mas a relação entre as etapas depende de navegar para outras áreas. A OS pode ser criada tanto pelo orçamento aprovado quanto pelo formulário “Nova OS”; o formulário independente pede novamente cliente, recebimento, orçamento, técnico, prioridade, status e datas. Isso cria duplicação de caminhos e torna possível iniciar uma OS fora da aprovação do orçamento. O backend só exige status válido na criação de OS e de orçamento; a proteção de transição aplica-se às atualizações, não impede cadastro inicial em estado avançado.

**Recomendação:** tratar o atendimento/equipamento como raiz da jornada. Ações sequenciais devem aparecer no mesmo detalhe: “Registrar diagnóstico”, “Preparar orçamento”, “Enviar ao cliente”, “Registrar decisão”, “Iniciar reparo”. Criar OS automaticamente ou em uma ação única após aprovação, com cliente/equipamento/orçamento preenchidos e sem reentrada manual. Manter criação excepcional com motivo e permissão específica.

**Referências:** frontend `RecebimentoDetailPage.tsx`, `OrdemServicoFormPage.tsx`, `OrcamentoFormPage.tsx`; backend `src/orcamentos/orcamentos.service.ts` (`gerarOrdemServico`) e `src/ordens-servico/os.service.ts` (`create`).

### 4. Status mistura trabalho técnico, financeiro e retirada — **Alta**

O status operacional da OS termina em `concluida`, enquanto a entrega acontece depois, sem mudar esse status. A tela considera uma OS concluída “encerrada para alterações de fluxo”, mas pode mostrar nela pendência de venda/pagamento e ainda permitir registrar retirada. Portanto, “concluída” tanto pode significar serviço pronto quanto atendimento já encerrado. Não há estado explícito de “pronto para retirada”, “aguardando pagamento” ou “entregue”; a interface precisa inferir isso combinando dados de venda e assinatura.

**Recomendação:** separar os eixos e usar rótulos orientados ao cliente/equipe: etapa técnica (`Em diagnóstico`, `Aguardando peça`, `Em reparo`, `Serviço concluído`) e situação de retirada (`Aguardando pagamento`, `Pronto para retirada`, `Entregue`). A entrega deve registrar a transição final, ser idempotente e impedir segunda retirada. Na lista, mostrar a próxima ação e o tempo parado nessa etapa.

**Referências:** backend `src/ordens-servico/state/os.states.ts`, `src/ordens-servico/os.service.ts` (`registrarEntrega`); frontend `OrdemServicoDetailPage.tsx`.

### 5. Listas e formulários não ajudam a priorizar o trabalho — **Alta**

As listas compartilham `GenericListPage`, que carrega a coleção inteira, exibe apenas contagem e tabela e não oferece busca, filtros, ordenação ou paginação. A lista de recebimentos não mostra o cliente; a de OS não inclui equipamento, prioridade, técnico, prazo/tempo parado, nem situação financeira/retirada. O status da lista de OS e recebimentos é apresentado como valor técnico (`em_diagnostico`, `em_triagem`) em vez de rótulo humano. Em bases maiores, trazer tudo também reduz desempenho e dificulta localizar itens urgentes.

**Recomendação:** criar uma fila de atendimento com busca por nome, telefone, número de protocolo, IMEI/serial e código; filtros por etapa, técnico, prioridade e atraso; ordenação por antiguidade/próximo prazo; paginação no servidor. Mostrar como mínimo: protocolo, cliente, equipamento, etapa em linguagem natural, responsável, entrada e próxima ação. Separar vistas “Aguardando aprovação”, “Aguardando peça”, “Em reparo” e “Prontos para retirada”.

**Referências:** frontend `src/components/GenericListPage.tsx`, `src/modules/atendimento/recebimento/pages/RecebimentosListPage.tsx`, `src/modules/atendimento/ordemServico/pages/OrdensServicoListPage.tsx`; backend `findAll` sem parâmetros de consulta em serviços de recebimento, OS e orçamento.

### 6. IDs longos: clientes já estão bem tratados, mas ainda há fallback ruim — **Média**

Na listagem de clientes não há coluna de ID, o que atende ao exemplo citado. Orçamentos e OS exibem somente os últimos seis caracteres do `_id`, e o detalhe do cliente faz o mesmo; isso é melhor que expor o ObjectId completo, mas continua sendo um código técnico, potencialmente ambíguo e pouco fácil de comunicar. Há um caso concreto pior: no formulário de OS, o rótulo de orçamento usa o `_id` integral quando não há `numero`. O recebimento também não tem protocolo sequencial legível claramente exposto nas listas.

**Recomendação:** criar número de protocolo humano e sequencial por empresa e ano (por exemplo `OS-2026-001248`, `REC-2026-001248`, `ORC-2026-000431`). Usar esse número em listas, documentos e mensagens. Manter o ObjectId só em rotas/APIs e ações técnicas. No seletor, exibir protocolo + cliente + equipamento + data/valor, nunca o ID cru.

**Referências:** frontend `src/modules/clientes/pages/ClientesListPage.tsx`, `src/modules/atendimento/ordemServico/pages/OrdensServicoListPage.tsx`, `src/modules/atendimento/orcamento/pages/OrcamentosListPage.tsx`, `src/modules/atendimento/ordemServico/pages/OrdemServicoFormPage.tsx` (`getOrcamentoLabel`).

### 7. Cliente recebe atualizações sem confirmação clara de envio — **Média**

O detalhe da OS prepara a comunicação para WhatsApp/e-mail e informa “Mensagem aberta ... e registrada”. Abrir um aplicativo ou cliente de e-mail não comprova que a pessoa enviou ou recebeu a mensagem. O fluxo também tem poucas atualizações com contexto além do status. Isso pode levar a equipe a acreditar que o cliente foi avisado quando a comunicação só foi preparada.

**Recomendação:** distinguir “mensagem preparada”, “enviada pelo atendente” e “entregue/visualizada” (quando o canal permitir). Oferecer texto claro e contextual para orçamento aguardando aprovação, atraso por peça, conclusão e retirada, com link de acompanhamento e opção de registrar contato/retorno esperado.

**Referências:** frontend `src/modules/atendimento/ordemServico/pages/OrdemServicoDetailPage.tsx` (`handleCompartilharStatus`); templates em backend `src/comunicacao/templates/template-comunicacao.defaults.ts`.

### 8. Peças reservadas são registradas como itens usados apenas ao consumir — **Média**

O backend mantém reserva e consumo separados, o que é correto para o estoque. Na interface, a equipe pode reservar peça em diagnóstico ou execução e consumi-la depois, mas o fluxo não orienta claramente o que falta para sair de “aguardando peça” nem vincula a reserva a uma data prevista/fornecedor. A transição de “aguardando peça” para execução é manual e não informa se a peça chegou.

**Recomendação:** exibir uma pendência de peça por item, com disponibilidade, fornecedor/pedido, previsão de chegada e ação “Peça recebida / iniciar reparo”. Ao consumir a reserva, atualizar o checklist da OS e deixar explícita a quantidade lançada.

**Referências:** backend `src/ordens-servico/os.service.ts` (`reservarPeca`, `consumirReserva`); frontend `src/modules/atendimento/ordemServico/pages/OrdemServicoDetailPage.tsx`.

### 9. O fechamento pede campos sem orientar quem pode retirar — **Média**

A retirada exige nome e assinatura, e permite documento opcional. A tela não deixa evidente se o recebedor deve ser o próprio cliente ou um terceiro autorizado; tampouco há uma etapa de conferência visual do equipamento/acessórios antes de assinar. A assinatura é armazenada como imagem Base64 na OS, que pode aumentar bastante o registro e não aparece como comprovante pronto para o cliente.

**Recomendação:** mostrar o nome do cliente e perguntar “Quem está retirando?” com opções “Cliente” e “Outra pessoa”; coletar autorização/observação quando for terceiro. Antes da assinatura, apresentar equipamento, acessórios entregues e resumo do serviço. Gerar comprovante de retirada para impressão/compartilhamento e guardar a imagem em storage adequado com referência no registro.

**Referências:** backend `src/ordens-servico/dto/registrar-entrega-os.dto.ts`, `src/ordens-servico/os.service.ts` (`registrarEntrega`); frontend `src/modules/atendimento/ordemServico/pages/OrdemServicoDetailPage.tsx`.

### 10. Formulários expõem etapas técnicas como campos comuns — **Média**

Na criação de orçamento o status é um campo selecionável, e na criação da OS também se escolhe estado operacional e data de conclusão. Isso pede do usuário que conheça o modelo interno e permite começar o registro em um estado que normalmente deveria resultar de uma ação. O formulário de OS ainda não oferece `aguardando_peca`, apesar de o backend aceitar esse estado. Rótulos do status em algumas listas ficam em snake_case.

**Recomendação:** retirar estados controlados de formulários de cadastro; definir `rascunho`/`aberta` automaticamente e oferecer ações com verbos. Manter vocabulário consistente e explicações curtas, por exemplo “Aguardando peça — o reparo pausa até a chegada do componente”. Registrar motivo em reprovação, cancelamento e exceções.

**Referências:** frontend `src/modules/atendimento/orcamento/pages/OrcamentoFormPage.tsx`, `src/modules/atendimento/ordemServico/pages/OrdemServicoFormPage.tsx`, listas de OS/recebimentos; backend `src/orcamentos/orcamentos.service.ts` e `src/ordens-servico/os.service.ts`.

## Proposta de jornada mais intuitiva

1. **Receber:** localizar ou cadastrar cliente; registrar aparelho, IMEI/serial, queixa do cliente, senha/padrão quando aplicável e itens entregues; fotografar avarias; revisar e assinar termo. Gerar protocolo imediatamente.
2. **Triar e diagnosticar:** atribuir responsável, registrar sintomas/testes e prazo estimado. Se houver custo, preparar orçamento com peças/serviços e validade.
3. **Aguardar cliente:** enviar orçamento com link simples; mostrar quando foi enviado e registrar aprovação/reprovação, canal e data. Enviar lembrete/contato pendente quando necessário.
4. **Executar reparo:** criar OS automaticamente após aprovação; reservar peça, indicar previsão e avisar o cliente se houver atraso; registrar consumo e serviços feitos.
5. **Concluir serviço:** revisão técnica e checklist de qualidade; gerar venda/recibo de forma integrada e registrar pagamento ou saldo pendente.
6. **Liberar e entregar:** com serviço pronto, mostrar “Pronto para retirada”; avisar cliente; na retirada, conferir identidade/terceiro, acessórios, coletar assinatura e emitir comprovante. Só então marcar “Entregue”.

Cada etapa deve ter: responsável, quando começou, o que falta, próxima ação, prazo/tempo parado e histórico de comunicação. O detalhe do atendimento pode ser a tela principal; as listas funcionam como filas filtradas para cada papel.

## Plano sugerido de melhoria

| Fase | Entrega | Resultado esperado |
|---|---|---|
| **1 — Confiabilidade e linguagem** | Salvamento completo/idempotente do recebimento; estados iniciais automáticos; rótulos humanos; protocolo legível | Menos duplicidade, perda de informações e confusão com status/IDs |
| **2 — Jornada conectada** | Linha do tempo no detalhe do atendimento; criação de orçamento e OS guiada; próxima ação e pendências visíveis | Equipe entende onde o item está sem trocar entre módulos |
| **3 — Fila operacional** | Busca, filtros, ordenação, paginação e indicadores de atraso/aguardando cliente/peça/retirada | Localização rápida e priorização diária |
| **4 — Comunicação e fechamento** | Histórico de contato com confirmação, previsão e lembretes; checklist e comprovante de retirada | Cliente mais informado e fechamento verificável |

## Limites desta avaliação

Esta avaliação percorreu o código disponível no backend e no frontend irmão apontado pela documentação do projeto. Não foi feita validação com atendentes, observação de uso em balcão, revisão visual no navegador nem confirmação dos procedimentos reais da assistência. Por isso, as propostas de política (por exemplo, documentos exigidos para retirada e dados de senha/padrão) devem ser ajustadas à operação da empresa antes de virarem regras obrigatórias. O achado sobre IDs é específico: a listagem de clientes não os mostra; a recomendação é manter esse padrão e eliminar fallbacks que exibem ObjectIds integrais em outros pontos.
