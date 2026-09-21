# Resultado dos testes reais de homologação — Mantec

Rodada: 20/09/2026, horário de São Paulo. Parte dos registros técnicos usa 21/09/2026 em UTC.
Frontend: https://mantec.portalmantec.com.br . API utilizada pelo projeto: https://mantec3.portalmantec.com.br .

## Parecer

**Não liberar a versão testada para produção/venda ampla.** Foram reproduzidos acesso entre empresas, atribuição de perfil global por administrador de empresa, aceitação de sessão de usuário excluído e excesso de pagamento sob concorrência. A aprovação de orçamento pelo portal falhou. Esses resultados confirmam que a aprovação de build e testes unitários não é suficiente para liberação.

A rodada executou 49 verificações programáticas: 43 passaram e 6 falharam, além de testes de navegação e inspeção visual. Os 49 incluem verificações auxiliares de saúde e reversão de lançamentos; não representam 49 funcionalidades independentes. **43/49 não é um índice de prontidão nem cobertura completa do sistema.** As falhas críticas prevalecem sobre a contagem.

## Problemas confirmados

| ID | Prioridade | Resultado reproduzido | Evidência e impacto |
|---|---|---|---|
| H01 | P0 | Administrador da empresa A consultou e alterou usuário da B | GET e PATCH /usuarios/:id retornaram 200 com o usuário de outra empresa. Alteração limitada ao nome de uma conta fictícia; revertida. |
| H02 | P0 | Administrador da empresa atribuiu a si perfil administrador | PATCH do próprio usuário aceitou `perfil: administrador`, HTTP 200. Perfil restaurado imediatamente, sem executar ações com identidade promovida. Conta temporária removida ao final. |
| H03 | P1 | Token de usuário excluído continuou válido | Após DELETE do técnico fictício, GET /auth/me com seu token retornou 200. Comprova ausência de revogação nesse endpoint; não se exercitaram todas as operações após exclusão. |
| H04 | P1 | Duas solicitações simultâneas ultrapassaram o saldo de venda | Venda de R$ 100 já tinha R$ 40 pagos. Dois POSTs de R$ 40 retornaram 201 e foram persistidos: total R$ 120. |
| H05 | P1 | Aprovação do orçamento pelo portal falhou | Link abriu, mostrou orçamento enviado e permitiu confirmar. A confirmação retornou 401 e a página exibiu “Não foi possível registrar sua resposta”. Orçamento permaneceu enviado. |
| H06 | P1 | Erro do portal encerrou sessão do ERP no mesmo navegador | Após H05, recarregar a aba do ERP redirecionou para login. Interceptor compartilhado apaga autenticação a qualquer 401. |
| H07 | P1 | Datas apresentadas com um dia a menos | Recebimento cadastrado em 20/09 aparece como 19/09; validade 30/09 aparece como 29/09 em listagem, detalhe e portal; pagamento 20/09 aparece como 19/09. PDFs usam as datas 20/09 e 30/09, inconsistentes com as telas. |
| H08 | P2 | CPF obviamente inválido foi aceito | Cadastro com 111.111.111-11 foi salvo e apareceu no histórico e na auditoria. |
| H09 | P2 | Tela de venda transborda em celular e tablet | Em viewport de 390 px, página mede 919 px. Em 768 px, mede 923 px. Título e informações ficam fora da área visível, exigindo rolagem horizontal da página. |
| H10 | P2 | PDF de orçamento e recibo omitem descrição do serviço | Tabela exibe somente “servico”, quantidade e valores; o nome “disgnostico” aparece no ERP e portal, mas não nos PDFs examinados. |
| H11 | P2 | Termo não assinado contém mensagem contraditória | PDF exibe “Assinado: Não”, sem data/IP/hash de assinatura, mas termina com “Aceite registrado pelos metadados acima”. Corrigir para não sugerir aceite que não ocorreu. |
| H12 | P2 | OS concluída sem data de conclusão apresentada | Após Finalizar OS, status é Concluida e timeline registra transição, mas campo Conclusao permanece “-”. |
| H13 | P1, conforme regra comercial | Dados de empresa B consultáveis por administrador A | GET /empresas/:id retornou 200 com outra empresa. Se não houver função explícita de diretório global, restringir. |

P0 = bloqueio crítico de segurança; P1 = bloqueio relevante de operação/integridade; P2 = correção necessária de produto. Prioridades são julgamento técnico, sem atribuição de CVSS.

## O que passou nesta rodada

### Navegação e atendimento

- Login real e carregamento do painel.
- Cadastro do cliente fictício, persistência, histórico vazio e evento de auditoria.
- Recebimento com equipamento, serial, condições e termo sem assinatura; associação correta ao cliente.
- Geração de orçamento a partir do recebimento, preenchimento automático dos vínculos, item e total de R$ 100.
- Mudança interna de rascunho para enviado e aprovação interna (usada após falha do portal).
- Geração de OS e sequência aberta → diagnóstico → execução → concluída.
- Tentativa de reabrir OS concluída rejeitada com 400.
- Repetição da geração da OS retornou a mesma OS, sem criar outra no cenário sequencial.
- Venda importou o serviço e os R$ 100 do orçamento.
- Menu móvel abriu e navegou até clientes; a listagem de clientes coube na largura verificada. Isso não homologa todas as telas móveis.

### Financeiro

- Pagamento de R$ 101 para saldo R$ 100 foi rejeitado com mensagem de saldo insuficiente.
- Pagamento parcial de R$ 40 criou vínculo com título e movimento de caixa e mudou venda para `parcial`.
- Após o teste concorrente H04, os dois pagamentos extras fictícios foram removidos pelo fluxo de estorno da aplicação; saldo foi reconsultado e confirmado como R$ 60.
- Pagamento final fictício de R$ 60 levou a venda para `pago`.
- Tentativa adicional de R$ 1 após quitação foi rejeitada.
- Recibo final tem duas parcelas: R$ 40 + R$ 60 = R$ 100.

### Compras, estoque e garantia

- Produto e fornecedor fictícios cadastrados por API.
- Pedido recebido de duas unidades criou saldo 2 e um título a pagar.
- Repetição sequencial do status recebido manteve saldo 2.
- Cancelamento do pedido fictício retornou saldo a zero.
- Retirada superior ao saldo foi rejeitada.
- Um par de retiradas simultâneas da última unidade resultou em 201/400 e saldo zero. **Uma reprodução sem falha não elimina o risco de corrida observado no código; não equivale a teste de carga.**
- Garantia fictícia abriu, recusou salto direto para concluída, passou por análise → recusada → concluída e recusou reabertura.
- Não foram exercitados envio físico, crédito do fornecedor, troca ou devolução de garantia.

### Segurança e saúde

- Endpoints /health/live e /health/ready responderam 200 com X-Request-Id.
- /clientes, /usuarios, /vendas e /estoque/movimentos exigiram autenticação (401 sem token).
- Listagem de clientes da empresa A trouxe somente seu cliente fictício.
- Consulta/alteração do cliente fictício da B pela A não retornou nem alterou o registro. Resposta foi 200 vazia; melhorar semântica para 404/403, embora os dados tenham sido protegidos nesses casos.
- Técnico recebeu 403 ao consultar pagamentos e tentar alterar seu próprio perfil.
- Portal foi consultado pela API sem token de login do ERP e respondeu 200 usando apenas a sessão do portal.

## PDFs

Orçamento, termo e recibo retornaram HTTP 200 e arquivos PDF válidos de uma página. Foram extraídos e renderizados para inspeção visual. Layout básico legível, valores e vínculos corretos para o cenário. Omissão de descrição e mensagem de aceite estão registradas em H10/H11.

- `outputs/qa-homologacao-20260920/orcamento.pdf`
- `outputs/qa-homologacao-20260920/termo.pdf`
- `outputs/qa-homologacao-20260920/recibo.pdf`

O cabeçalho de emissão usa 21/09/2026 quando já é 21/09 UTC, ainda 20/09 em São Paulo. Unificar política de fuso também nos documentos. A extração textual apresentou caracteres de substituição em acentos, embora os PNGs tenham acentos visualmente corretos; avaliar acessibilidade/cópia de texto separadamente.

## Causas indicadas pelo código local

- H01/H02: operações em `src/usuarios/usuarios.service.ts` usam ID sem empresa; DTO aceita perfil livre; `admin_empresa` tem permissão de gerenciamento de usuários.
- H03: `src/auth/auth.service.ts` valida assinatura e expiração, não revogação/estado atual de conta.
- H04: `src/financeiro/pagamentos/pagamentos.service.ts` consulta total já pago antes de salvar; duas requisições podem observar o mesmo saldo.
- H05: `src/portal-cliente/portal-cliente.service.ts`, método `decidirOrcamento`, chama `orcamentosService.update` sem empresa; o serviço exige empresa e lança 401. Isso é consistente com a falha publicada observada, embora não tenha sido verificado o hash exato da imagem do servidor.
- H06: `src/services/api/interceptors.ts` do frontend limpa a sessão para todo 401, inclusive de endpoint público do portal.
- H07: renderização de datas sem horário com `new Date(...).toLocaleDateString` é consistente com o deslocamento UTC/São Paulo observado.

## Massa criada e estado final

Prefixo: `HOMOLOGACAO QA 20260920`. E-mails usam `example.invalid`; nenhuma mensagem externa foi enviada. Não houve emissão fiscal, cobrança real ou deploy.

Fluxo principal na Empresa Teste:

| Registro | ID | Estado final |
|---|---|---|
| Cliente fictício | 6ab055a227c365cc51a59c43 | Ativo, preservado para reproduções |
| Recebimento | 6ab055e227c365cc51a59c76 | Recebido; termo sem assinatura |
| Orçamento | 6ab0560527c365cc51a59c98 | Aprovado internamente |
| OS | 6ab0568727c365cc51a59cec | Concluída, sem retirada/assinatura |
| Venda | 6ab0761e27c365cc51a59e3d | Paga, total R$ 100, pagamentos fictícios R$ 40 + R$ 60 |

**A venda e os pagamentos fictícios afetam os indicadores da homologação.** Foram mantidos para rastreabilidade. Registros anteriores não foram alterados.

Duas empresas adicionais foram criadas para isolamento e desativadas no final. Três usuários temporários com senhas aleatórias foram excluídos; não se salvaram senhas ou tokens nos relatórios. Clientes e produto dessas empresas ficam como massa histórica isolada. Exclusão não invalida tokens emitidos, conforme H03; tokens temporários não foram entregues a terceiros e expiram pela política existente.

Compra fictícia cancelada; produto e fornecedor adicionais desativados; garantia fictícia concluída. IDs constam em `operations-results.json`. Lançamentos de auditoria/estorno permanecem como histórico. Links de portal criados para o cliente fictício podem permanecer válidos até expiração; não foram enviados a terceiros.

## Evidências programáticas

- `outputs/qa-homologacao-20260920/api-results.json`: 21 verificações, 16 aprovadas, 5 reprovadas; IDs e limpeza das contas temporárias.
- `outputs/qa-homologacao-20260920/finance-results.json`: 16 verificações, 15 aprovadas, 1 reprovada; concorrência, reversões e quitação.
- `outputs/qa-homologacao-20260920/operations-results.json`: 12 verificações aprovadas; compras, garantia, estoque e estados terminais.

Scripts locais foram preparados em `tmp/qa-*-live.cjs`; são ferramentas de execução única, com mutações em homologação e criação de massa. **Não reexecutar automaticamente:** reutilizam identificadores e alguns cenários pressupõem estado inicial específico. Não substituem suite isolada de regressão.

## Pendências: a homologação completa ainda não está encerrada

- Restauração de banco e arquivos, persistência após redeploy e rollback: falta acesso à infraestrutura/backup. Pipeline aponta para `/home/lemuel/stacks/05-apps/mantec3.yml` no servidor de deploy; esse caminho é uma pista, não comprovação de backup. Frontend usa a mesma pasta de stacks para `site-mantec2.yml`.
- Capacidade para 20 empresas/60 usuários: não medida. A rodada usou somente pares de requisições concorrentes, sem estresse ou volume representativo.
- Falhas induzidas de banco/rede no meio das gravações: exigem ambiente descartável com controle de infraestrutura.
- Cobertura completa de perfis, todas as rotas e referências cruzadas: foram usados administrador de empresa e técnico, além do acesso fornecido; não é pentest exaustivo.
- Uploads, proteção de tipos de arquivo, fotos/vídeos, assinatura gráfica e entrega: não homologados nesta rodada.
- Fechamento mensal, recorrências, anexos financeiros, relatórios extensos e reabertura: pendentes de cenários adicionais.
- Fiscal integrado, envio real de e-mail/WhatsApp e consultas externas: não executados; exigem escopo e ambientes próprios de teste.
- Compatibilidade em Safari/Firefox, dispositivos físicos e acessibilidade: pendente. Testes responsivos foram em um navegador com viewport controlado.
- Aprovação/reprovação completa no portal precisa ser repetida após H05/H06 corrigidos.

## Próxima etapa recomendada

Corrigir primeiro H01/H02/H03/H04/H05/H06, criar regressões automatizadas e repetir os cenários contra a nova versão publicada. Corrigir datas antes de validar documentos e prazos. Localizar com o responsável pelo servidor a stack e a rotina de backup, então fazer recuperação em ambiente isolado. Não declarar prontidão com base apenas na quantidade de testes aprovados.

Nenhum código de aplicação foi modificado nesta rodada. Foram criados relatórios e ferramentas temporárias de teste.
