# Avaliação de prontidão para produção e venda — Mantec

Data: 20/09/2026. Backend: da6da54. Frontend: 9e7b9fd.

## Parecer

Completude funcional estimada: 80%. Prontidão ponderada para produção e venda: 59% (58,75% antes do arredondamento). Não recomendo liberar comercialmente a versão atual como serviço compartilhado por empresas independentes. Há bloqueios de segurança e integridade, apesar de builds e testes aprovados.

São estimativas de engenharia com confiança moderada, não porcentagem objetiva de requisitos entregues ou probabilidade de sucesso. Não existe escopo comercial fechado fornecido pelo proprietário. O referencial é o ERP de assistência técnica indicado pelos módulos e checklists do projeto. Funcionalidade implementada não equivale a operação homologada.

## Critérios e pesos

| Área | Nota | Peso | Evidência principal |
|---|---:|---:|---|
| Funcionalidades do produto | 80% | 25% | Cadastros, recebimento, orçamento, OS, estoque, compras, vendas, pagamentos, financeiro administrativo, garantias, portal e documentos implementados; integrações externas e homologação incompletas ou não comprovadas. |
| Segurança e isolamento entre empresas | 45% | 25% | Guardas globais, permissões, scrypt, uploads privados e portal revogável; operações de usuários sem isolamento e sem controle adequado de atribuição de perfil. |
| Integridade de estoque e financeiro | 50% | 20% | Validações de saldo e valores monetários; gravações sequenciais sem transação ou controle evidente de concorrência. |
| Qualidade e testes | 65% | 15% | Builds, análise estática e 106 testes aprovados; ausência de testes automatizados de navegador e integração real nos testes HTTP examinados. |
| Operação e recuperação | 50% | 10% | Docker, CI, health checks e guia operacional; restauração de backups, persistência de uploads, alertas e carga não comprovados. |
| Preparação comercial | 35% | 5% | Checklist inicial; aceite operacional pendente e ausência de evidência de processo completo de implantação, suporte e gestão comercial. |

Escala: 0 = sem evidência; 25 = inicial; 50 = parcial ou com riscos relevantes; 75 = implementado com validação incompleta; 100 = critérios atendidos e demonstrados. As notas intermediárias refletem julgamento técnico. A média não supera bloqueios críticos.

## Verificações executadas

- Backend: `npm run ci:check` aprovado; typecheck, lint com 18 avisos e nenhum erro, 101 testes unitários em 20 suites, 5 testes HTTP em 2 suites e build aprovados.
- Frontend: `npm run ci:check` aprovado; lint e build aprovados.
- Execução local com Node v22.23.1. Docker e CI configurados com Node 20; a aprovação local não valida essa imagem.
- Auditoria de dependências de produção tentada nos dois projetos. Não concluída: falha de validação do certificado do registro npm. Nenhuma configuração TLS foi relaxada.
- Inspeção de código, DTOs, permissões, persistência, autenticação, arquivos privados, portal, pipelines e documentação.
- Não foram executados deploy, migrações, gravações no banco real, testes destrutivos, teste de carga ou navegação autenticada. Nenhum código da aplicação foi alterado.

## Bloqueios e riscos

### P0 — Isolamento e atribuição de privilégios

`src/usuarios/usuarios.controller.ts` encaminha listagem, consulta, alteração e exclusão sem a empresa da sessão. `src/usuarios/usuarios.service.ts:36` lista todos os usuários; linhas 81 e 86 alteram/excluem apenas pelo ID. O perfil `admin_empresa` recebe o evento de gerenciamento de usuários (`src/permissoes/matriz-permissoes.ts:208`).

Consequência pelo caminho de código: um administrador de uma empresa pode consultar e modificar usuários de outras empresas na mesma base. O DTO permite alterar senha, empresa e perfil. Como não há restrição de atribuição de perfil no serviço, existe também caminho para promoção a administrador global. Não foi explorado em produção.

Há operações globais semelhantes em empresas e perfis. Corrigir todo o perímetro, distinguindo administrador da plataforma e administrador da empresa. Validar com duas empresas e testes negativos reais: operações cruzadas devem ser negadas; um administrador de empresa não pode conceder privilégio global.

### P1 — Concorrência e gravação parcial

`src/estoque/estoque.service.ts:35` verifica disponibilidade e depois salva. Duas retiradas simultâneas podem observar o mesmo saldo disponível.

`src/financeiro/pagamentos/pagamentos.service.ts:23` consulta o total pago, salva o pagamento e depois atualiza venda e financeiro. Requisições simultâneas podem ultrapassar o saldo; uma falha após salvar pode deixar pagamento, venda e caixa divergentes. Não há transação/controle equivalente evidente nesses caminhos.

Critério de correção: operações atômicas ou estratégia equivalente, controle de concorrência e prevenção de duplicidade em reenvios. Demonstrar com testes concorrentes e falhas induzidas em banco isolado. Não basta adicionar uma transação sem garantir as invariantes concorrentes.

### P1 — Revogação de sessão interna

`src/auth/auth.service.ts:18` emite token válido por 12 horas. `verifyToken` valida assinatura e prazo, sem consultar se o usuário ainda existe, foi bloqueado ou mudou de perfil. O guard usa o perfil embutido no token. Remover usuário ou alterar senha/perfil não revoga por esse caminho uma sessão já emitida.

Critério de correção: demonstrar que revogação, remoção e redução de privilégios invalidam o acesso conforme política definida. O portal do cliente já tem sessões revogáveis; isso não resolve a sessão interna.

### P1 — Homologação e recuperação não demonstradas

`test/fluxo-operacional.e2e-spec.ts` usa serviços simulados e substitui guardas de autenticação e autorização. A contagem de testes aprovados não demonstra integração do fluxo completo nem isolamento de dados no banco.

O documento `implantacao/evidencias/20260804-fase-7-homologacao-final.md` do frontend registra pendência de validação humana de portal, PDFs, perfis e fluxo completo. O checklist de go-live mantém itens sem aceite. Não encontrei evidência posterior de conclusão nos materiais examinados.

O guia operacional recomenda backup, mas não comprova restauração. A configuração real da stack está fora destes repositórios. É necessário confirmar volume/armazenamento persistente para uploads, backup conjunto de banco e arquivos, restauração, retorno à versão anterior e alertas.

### P1 — Ambiente de execução sem suporte upstream

Os Dockerfiles e pipelines usam Node 20. Em 20/09/2026, essa linha consta como encerrada na documentação oficial: https://nodejs.org/en/about/eol . Atualizar para uma linha suportada e validar a imagem efetivamente implantada.

### Escopo fiscal e integrações

`src/fiscal/nota-fiscal-servico/nota-fiscal-servico.service.ts` cadastra e manipula registros, mas não realiza chamada a provedor fiscal no fluxo examinado. O evento de auditoria chamado "emitida" não comprova emissão autorizada. Não comercializar como emissor fiscal integrado sem implementar e homologar essa integração; registro manual pode ser escopo legítimo se declarado.

O serviço de consulta de IMEI também armazena registros, sem integração de consulta externa observada. A presença de uma tela ou módulo não comprova integração com um serviço externo.

### P2 — Dependências, desempenho e produto comercial

- `xlsx` declarado em `^0.18.5` está em faixa afetada por CVE-2023-30533: https://github.com/advisories/GHSA-4r6h-8v6p-xvw6 . Não encontrei importação do pacote no código de aplicação examinado; os relatórios usam gerador próprio. Portanto, não afirmo exploração ativa. Remover a dependência se desnecessária e concluir auditoria completa.
- Listagens de clientes e movimentos de estoque carregam registros sem paginação; o resumo de estoque carrega produtos e movimentos da empresa. Validar tempo e memória com volume representativo.
- O limite de requisições usa memória de cada instância. Validar comportamento com múltiplas réplicas.
- Não foram demonstrados procedimentos completos de implantação de novo cliente, treinamento, suporte, encerramento e exportação de dados. Cobrança e contratação podem ser manuais; sua automação não é requisito obrigatório para a primeira venda.
- Documentação contratual e de privacidade não foi fornecida para análise. Não foi realizada avaliação jurídica nem atribuída certificação de conformidade.

## Sequência para liberação

1. Corrigir isolamento, atribuição de perfis e revogação de sessões; adicionar testes de regressão com empresas distintas.
2. Corrigir consistência de estoque/pagamentos e demonstrar comportamento sob concorrência, repetição e falhas.
3. Atualizar runtime, concluir auditoria de dependências e validar imagens de implantação.
4. Homologar o fluxo recebimento → orçamento → OS → estoque → venda → pagamento → garantia, incluindo portal, PDFs e perfis, em banco separado e com dados realistas.
5. Demonstrar backup/restauração de banco e arquivos, persistência após atualização, rollback e alertas.
6. Definir escopo da oferta, implantação, treinamento e suporte; executar piloto acompanhado e registrar aceite.

Instalação e banco exclusivos por cliente reduzem o risco de acesso entre empresas, mas não corrigem elevação de privilégio, revogação ou inconsistência financeira. Um piloto comercial pode ser considerado depois dos bloqueios pertinentes corrigidos e homologação mínima comprovada. Na versão examinada, a indicação é homologação controlada.

## Limites da avaliação

A análise é uma revisão técnica baseada no código local, verificações automatizadas disponíveis e documentos encontrados. Não equivale a pentest completo ou aceite operacional. Ausência de evidência no repositório não prova inexistência de processos externos. Os percentuais devem ser recalculados quando forem apresentados escopo comercial, topologia real, provas de restauração, testes integrados e aceite dos usuários.
