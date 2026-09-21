# Correções das falhas de homologação — 21/09/2026

As correções abaixo foram implementadas nos projetos locais de backend e frontend. Não foram publicadas no servidor. A confirmação no ambiente de homologação depende de implantar essa versão e repetir os cenários registrados em `testes-homologacao-2026-09-20.md`.

| Achado | Correção implementada | Verificação local |
|---|---|---|
| H01 — usuários de outras empresas | Filtros por empresa em consulta, edição e exclusão; criação não permite escolher outra empresa para administradores de empresa. | Testes de isolamento e ausência de contexto. |
| H02 — escalada de privilégios | Apenas administrador da plataforma atribui esse perfil; aliases também são bloqueados. Administrador de empresa não altera nem remove contas de administrador da plataforma. Gerente não gerencia empresas. | Testes de atribuição proibida, mudança de empresa e filtros de escrita. |
| H03 — sessões após exclusão/desativação | Autenticação consulta o usuário e a empresa atuais. Alterações no usuário incrementam a versão da sessão. Usuário excluído/inativo, empresa inativa e perfil alterado invalidam o acesso. | Testes de login e de revogação em cinco situações. |
| H04 — pagamentos simultâneos excedem saldo | Criação, edição e remoção usam transação MongoDB. Uma escrita na venda serializa as transações concorrentes antes da soma dos pagamentos. Caixa, títulos e auditoria participam da mesma transação. Transferência de pagamento para outra venda é rejeitada. | MongoDB temporário com replica set: concorrência 40 + 40 sobre saldo 60; falha injetada após caixa com rollback; edição e remoção. |
| H05 — decisão de orçamento pelo portal | Aprovação, reprovação e expiração transmitem a empresa da sessão validada. Validade respeita o dia completo em São Paulo. | Três testes de regressão. |
| H06 — erro do portal encerra sessão interna | Cliente HTTP público separado, sem token e interceptadores da sessão interna. | Testes de erro 401 público e interno. |
| H07 — datas incorretas | Formulários usam o dia em São Paulo. Datas de calendário armazenadas à meia-noite UTC preservam o dia; demais instantes usam São Paulo. Cabeçalho dos PDFs usa esse fuso. | Testes de datas, inclusive após 21h; revisão visual. |
| H08 — CPF/CNPJ inválidos | Validação dos dígitos verificadores no cadastro e na edição do documento; sequências repetidas são rejeitadas. | Dez casos válidos/inválidos. |
| H09 — tela de venda ultrapassa largura | Colunas adaptáveis, quebra de identificadores e rolagem restrita à tabela. | Navegador com dados fictícios: viewport solicitado 390 e 768 px; conteúdo igual à largura útil de 375 e 753 px, respectivamente. |
| H10 — PDFs sem descrição dos itens | Orçamento e recibo resolvem nomes do catálogo dentro da empresa; tabela inclui descrição. Texto não é mais truncado a quatro linhas por célula. | Testes de conteúdo e renderização de PDFs fictícios. |
| H11 — termo afirma aceite inexistente | Documento sem assinatura não afirma aceite registrado; texto distingue aceite eletrônico. | Teste de conteúdo e revisão visual do termo sem assinatura. |
| H12 — OS concluída sem data | Transição para concluída registra o instante no servidor. | Teste de data gerada ao concluir. |
| H13 — consulta de outras empresas | Administrador de empresa consulta somente sua empresa; gerenciamento fica restrito ao administrador da plataforma. | Testes de consulta e gestão proibidas. |

## Verificações

- Backend: 132 testes unitários, 5 testes HTTP e 3 testes de integração com MongoDB temporário aprovados; checagem de tipos, lint e compilação aprovados. Permanecem 18 avisos de lint preexistentes.
- Frontend: 5 testes de regressão aprovados; lint e compilação aprovados; verificação visual de celular/tablet com dados fictícios.
- PDFs de orçamento e termo renderizados e inspecionados em `outputs/*-corrigido.*`; recibo também gerado e testado quanto à descrição.
- Nenhuma alteração de dados de homologação foi necessária para validar as correções locais.

## Dependências e implantação

- Removida a dependência `xlsx`, sem uso no código, e aplicadas atualizações compatíveis dos arquivos de dependências.
- Overrides para versões corrigidas de `multer` e `brace-expansion`.
- Dockerfiles e verificações de integração contínua passam de Node 20 para Node 22.
- Auditoria de dependências após as atualizações: backend com 8 alertas moderados na cadeia do Firebase/UUID; frontend com 2 moderados na cadeia do React Router. Não restaram alertas altos ou críticos. Esses alertas moderados ainda precisam de atualização/migração e validação específica.
- A transação financeira exige MongoDB em replica set ou cluster compatível. Validar a topologia do servidor antes de publicar; não existe fallback para gravações parciais. Implementação segue a propagação de sessão documentada em https://mongoosejs.com/docs/transactions.html#using-asynclocalstorage.
- Sessões antigas serão recusadas após a atualização: os usuários precisarão entrar novamente. Contas de clientes devem usar `admin_empresa`; `administrador`/`admin` é reservado à plataforma.
- A correção não reconcilia retroativamente pagamentos inconsistentes nem inventa datas históricas de conclusão.
- Teste de integração cria e remove seu próprio MongoDB local, sem usar `MONGO_URI`. O primeiro uso baixa o binário oficial e pode demorar.

## Ainda necessário antes da venda

Publicar e repetir os cenários reais em homologação; validar backup e restauração, carga para aproximadamente 20 empresas, matriz completa de perfis, uploads/assinaturas/entrega, fechamento financeiro e integrações externas. As correções locais não equivalem a aprovação para produção.
