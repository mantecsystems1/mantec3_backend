# Plano de implementação fiscal do Mantec

Data: 11/10/2026. Estado: planejado, sem implementação ou publicação nesta tarefa.

Atualização de escopo: a direção atual é uma API própria, separada do ERP e inicialmente para uso interno da assistência. Seguir o [plano da API fiscal própria](plano-api-fiscal-propria-2026-10-11.md). As referências à Notaas neste documento ficam como alternativa histórica; não representam a integração escolhida para a primeira entrega.

Objetivo: permitir que cada empresa configure sua emissão fiscal pelo Mantec e emita documentos oficiais de serviços e mercadorias, com isolamento entre clientes, rastreabilidade e prevenção de duplicidades.

## 1. Escopo e decisões

- Manter a estrutura atual: uma empresa do Mantec representa um CNPJ emitente. Gestão de redes e filiais fica para outro projeto.
- Reaproveitar os dados de Minha Empresa. A configuração fiscal complementa esse cadastro, sem exigir redigitação dos dados já existentes.
- Primeira entrega comercial: NFS-e para serviços, exclusivamente nas combinações de município, regime e operação homologadas.
- Segunda entrega: NFC-e para venda de mercadorias no varejo nas UFs homologadas. Terceira: NF-e para operações definidas com o responsável fiscal.
- Uma venda pode originar mais de um documento. A separação de serviços, peças utilizadas e mercadorias depende do enquadramento validado; não presumir uma regra única para toda assistência técnica.
- Notaas é a candidata inicial. A integração terá um adaptador para evitar dependência direta do fornecedor em vendas e cadastros.
- A API não substitui o cadastro fiscal correto nem a validação das regras pelo contador.
- Não prometer atendimento a todos os regimes ou localidades apenas porque o formulário possui essas opções.

**Correção de premissa comercial:** a documentação consultada identifica a gestão de empresas e certificados por API como “Org API · Enterprise”. O cadastro automático não pode ser tratado como benefício garantido do plano gratuito. Limites de CNPJs, notas, acesso aos endpoints e custos precisam ser confirmados na conta/contrato antes da integração real. [Documentação de gestão via API](https://docs.notaas.com.br/docs/org-api).

Dois modos previstos:

1. **Vinculação assistida:** cadastrar o projeto no provedor e vincular suas credenciais à empresa no Mantec. O painel fiscal informa quais ajustes ainda exigem o painel externo.
2. **Cadastro integrado:** quando contratado, criar e atualizar o projeto fiscal e enviar o certificado pelo Mantec. Segredos de organização permanecem apenas no servidor.

## 2. Situação verificada no código

| Área | Existe hoje | Trabalho necessário |
|---|---|---|
| Empresa | CNPJ, razão social, contatos, endereço, logo e edição própria | Complemento fiscal, credenciais, município IBGE e prontidão por documento |
| Catálogo | Produtos e serviços separados | Dados fiscais e regras de tributação por operação |
| Itens de venda | Campo `tipo`, referência, quantidade e valores | Validar tipos, preservar composição e registrar cópia fiscal dos itens |
| Nota de serviço | Registro associado à venda, número e status livres, XML/PDF opcionais | Emissão oficial, estados controlados e identificação direta da empresa |
| Formulário fiscal | Número aleatório sugerido e status “emitida” manual | Pré-validação, envio e acompanhamento real |
| Detalhe fiscal | ISS/PIS/COFINS fixos e código de verificação derivado do ID local | Mostrar somente dados fiscais verificados, sem identificadores inventados |
| Cancelamento | A rota DELETE apaga o registro local | Evento de cancelamento no provedor, preservando histórico |
| Segurança | Permissões de consultar/emitir/cancelar e consulta da empresa via venda | Permissões específicas de configuração, segredos e arquivos |
| Arquivos | Infraestrutura existente de arquivos privados | Estender para XML/PDF/eventos fiscais, com cópia e restauração |

Referências locais inspecionadas:

- Backend: `src/fiscal/nota-fiscal-servico/`, `src/core/empresa/`, `src/financeiro/vendas/schemas/`, `src/catalogo/`, `src/permissoes/matriz-permissoes.ts`, `src/common/uploads/`.
- Frontend: `src/modules/fiscal/` e `src/modules/empresas/pages/MinhaEmpresaPage.tsx`.

## 3. Ordem de execução

| Etapa | Entrega | Dependência | Responsabilidade |
|---|---|---|---|
| 0 | Escopo fiscal e viabilidade do provedor | Nenhuma | Produto + contador + desenvolvimento |
| 1 | Correção da apresentação atual e tratamento dos registros antigos | Inventário inicial | Desenvolvimento |
| 2 | Modelo fiscal, isolamento e permissões | 0–1 | Desenvolvimento |
| 3 | Configuração fiscal em Minha Empresa | 2 | Desenvolvimento + contador |
| 4 | Credenciais, certificado e conexão | 0, 2–3 | Desenvolvimento + operação + cliente |
| 5 | Cadastro fiscal de serviços/produtos e composição da venda | 2–3 | Desenvolvimento + contador |
| 6 | Processamento confiável e adaptador Notaas | 2, 4 | Desenvolvimento + operação |
| 7 | Emissão completa de NFS-e | 5–6 | Desenvolvimento + testes |
| 8 | Homologação e piloto de serviços | 1–7 | Testes + contador + operação |
| 9 | NFC-e e venda mista | Base aprovada em 8 | Desenvolvimento + contador |
| 10 | NF-e e operações adicionais | Base aprovada em 8; reutilizar 9 | Desenvolvimento + contador |
| 11 | Liberação gradual e manutenção | Aceite de cada modelo | Produto + operação |

As etapas 3 e 5 podem avançar com dados fictícios antes da contratação. A comunicação real com o provedor depende da etapa 0. Cada etapa terá registro de arquivos alterados, testes, evidências e pendências; implementação, homologação e publicação serão estados separados.

## 4. Etapa 0 — Confirmar condições de emissão

1. Selecionar um CNPJ piloto, sua UF, município, regime e atividades realmente praticadas.
2. Com o contador, definir exemplos de manutenção, troca de peça e venda de acessórios, com documentos e tratamento fiscal esperados.
3. Confirmar cobertura do provedor por documento/localidade, ambiente de testes disponível e exigências de credenciamento. [Cobertura NFS-e](https://docs.notaas.com.br/docs/cobertura).
4. Confirmar plano para o piloto e para aproximadamente 20 empresas: quantidade de CNPJs, cotas, excedentes, limites de requisições, suporte e API de organização. Não assumir 50 notas gratuitas por empresa.
5. Confirmar idempotência do provedor, consulta por referência, cancelamento, obtenção dos arquivos e eventos suportados. Registrar limitações como critérios de projeto.
6. Definir quem administra a conta do provedor e suas despesas: Mantec centralizado ou contas dos clientes.
7. Conferir emissor anterior, séries e sequência em uso. Distinguir número de DPS/RPS do número oficial da NFS-e. Não adotar série 1 automaticamente.
8. Validar leiautes vigentes e requisitos aplicáveis de IBS/CBS com fontes oficiais e contador antes de congelar o contrato técnico. Não fixar alíquotas no frontend.

**Aceite:** matriz de cobertura aprovada, caminho de integração escolhido e exemplos fiscais de referência. Sem isso, pode-se construir a base, mas não declarar emissão pronta para produção.

## 5. Etapa 1 — Corrigir a base e preservar o legado

1. Remover número aleatório, código de verificação inventado e cálculos fixos de impostos da experiência de emissão.
2. Separar registro manual/importado de documento autorizado pelo provedor. Uma escolha de status pelo usuário não comprova autorização.
3. Inventariar notas antigas, vendas e empresas relacionadas. Não emitir automaticamente registros existentes.
4. Criar migração repetível, com simulação e relatório: atribuir empresa pela venda, manter IDs/valores anteriores e identificar origem legada. Registros sem vínculo confiável ficam pendentes de revisão.
5. Bloquear alteração destrutiva e exclusão de documentos oficiais. Desativar ou adaptar rotas antigas para não contornar o fluxo novo.
6. Gerar backup e testar a migração em cópia do banco antes de executá-la no ambiente real.

**Aceite:** nenhuma tela apresenta um registro manual como autorização comprovada; legado preservado; executar a migração duas vezes não duplica dados.

## 6. Etapa 2 — Estrutura fiscal e segurança por empresa

Criar estruturas específicas, evitando concentrar segredos e documentos no cadastro básico:

| Estrutura proposta | Conteúdo principal |
|---|---|
| Configuração fiscal | Empresa, regime, inscrições, modelos habilitados, ambiente, séries, vigência e versão |
| Conexão fiscal | Empresa, provedor, projeto externo, referências dos segredos, capacidades e estado de sincronização |
| Documento fiscal | Empresa, venda, modelo, ambiente, status, identificadores oficiais, totais, itens e cópia dos dados de emissão |
| Tentativa fiscal | Documento, chave de idempotência, versão da solicitação, resultado, erro e correlação |
| Evento fiscal | Autorização, rejeição, cancelamento e outros eventos, com datas, origem e referência externa |
| Trabalho pendente | Solicitação durável, tentativas, próxima execução e reserva temporária do processamento |
| Arquivo fiscal | Documento, tipo de arquivo, localização privada, integridade e estado da obtenção |

Roteiro:

1. Tornar `empresaId` obrigatório nos registros fiscais novos e em todos os filtros de acesso.
2. Definir índices únicos para chave de idempotência por empresa/ambiente e documento externo por conexão. Não impor unicidade somente por venda: uma venda pode gerar vários documentos legítimos.
3. Preservar cópia do emitente, destinatário, itens, impostos e regras aplicadas. Alterar um cadastro depois não modifica a nota anterior.
4. Separar estado fiscal de estado dos arquivos: nota autorizada pode estar aguardando PDF/XML.
5. Usar estados controlados: rascunho, pendente, processando, aguardando conciliação, autorizada, rejeitada, cancelamento solicitado e cancelada. Registrar falhas técnicas separadamente de rejeições fiscais.
6. Não permitir que um evento antigo reverta uma autorização/cancelamento posterior.
7. Criar permissões explícitas para configurar dados fiscais, gerir credenciais, emitir, cancelar e baixar documentos. Revisar perfis que hoje recebem automaticamente todos os novos eventos, especialmente gerente.

Matriz proposta:

| Perfil | Configuração e certificado | Documentos fiscais |
|---|---|---|
| Administrador mestre | Gestão da integração e suporte com empresa-alvo explícita e auditoria | Acesso de suporte rastreável; sem empresa implícita |
| admin_empresa | Configuração e substituição de credenciais da própria empresa | Consulta, emissão, cancelamento e arquivos próprios |
| Fiscal | Dados fiscais operacionais necessários, sem revelar segredos | Consulta, emissão e cancelamento da própria empresa |
| Gerente | Sem credenciais por padrão | Preservar permissões de operação atuais; cancelamento continua restrito |
| Demais perfis | Sem configuração fiscal por padrão | Somente eventos expressamente concedidos |

Nenhum perfil recebe a senha do certificado ou a chave completa em respostas de leitura. IDs enviados pelo navegador nunca substituem a empresa autorizada no servidor.

**Aceite:** empresa A não consulta, emite, cancela, configura ou baixa arquivos de B, inclusive por URLs e IDs manipulados.

## 7. Etapa 3 — Configuração em Minha Empresa

1. Acrescentar a aba Fiscal no acesso já existente pelo rodapé.
2. Reaproveitar razão social, CNPJ, endereço e contatos; complementar município IBGE, inscrições e CNAEs aplicáveis.
3. Separar natureza jurídica, porte e regime tributário. ME/EPP não será tratada como sinônimo de Simples Nacional.
4. Ter regime interno legível e mapeamentos distintos para NFS-e e CRT de NF-e/NFC-e. Não reutilizar o código numérico de um modelo em outro. [Conceitos do provedor](https://docs.notaas.com.br/docs/nfe/conceitos).
5. Exibir campos condicionais por documento, município e regime; ocultar campos inaplicáveis sem apagar histórico.
6. Configurar séries/sequências de cada modelo conforme emissor anterior. Preferir um único responsável pela numeração; não manter contadores concorrentes no Mantec e no provedor.
7. Separar homologação e produção; impedir troca casual de ambiente com solicitações pendentes.
8. Mostrar prontidão por documento: cadastro incompleto, certificado pendente, configuração em revisão, disponível em homologação ou liberado em produção.
9. Registrar versão, início de vigência e responsável por alterações tributárias. Troca de CNPJ após emissão exige fluxo específico, preservando documentos anteriores.

**Aceite:** administrador da empresa configura seus dados uma vez; a tela explica pendências sem apresentar como pronta uma empresa ainda não habilitada.

## 8. Etapa 4 — Certificado, credenciais e conexão

1. Implantar armazenamento protegido para API keys, segredo dos webhooks e CSC quando aplicável; chaves de proteção ficam fora do banco e do repositório.
2. Implementar vinculação assistida ou cadastro integrado conforme capacidade contratada. Tratar projeto já existente sem criar duplicata.
3. No modo integrado, receber A1 e senha exclusivamente no backend, verificar limite de tamanho, conteúdo PKCS#12, senha, validade e identidade compatível com o emitente.
4. Enviar ao provedor e descartar arquivo temporário e senha após concluir a operação. Por padrão, não manter A1 local. Caso o fornecedor exija retenção, documentar e proteger essa exceção antes de adotá-la.
5. Armazenar apenas metadados necessários: validade, identificação, estado e referência externa. Sanitizar logs, auditoria e mensagens de erro.
6. Permitir renovar/substituir o certificado; emitir alertas internos de vencimento e impedir nova emissão com certificado inválido.
7. Distinguir “conexão válida” de “empresa habilitada a emitir”. Testar conectividade com operação de consulta, sem gerar nota real.
8. Sincronizar alterações de cadastro explicitamente e mostrar falhas de sincronização. Nunca indicar sucesso antes da confirmação externa.

**Aceite:** senha errada, arquivo inválido, certificado vencido e credencial de outra empresa são recusados; nenhum segredo aparece em respostas, navegador, logs ou auditoria.

## 9. Etapa 5 — Catálogo e venda

1. Serviços: descrição fiscal, código nacional/municipal pertinente, CNAE quando exigido, parâmetros de ISS, retenções e demais classificações necessárias.
2. Produtos: NCM, origem, unidade, GTIN quando aplicável, CEST quando exigido e identificação fiscal.
3. Definir perfis tributários por regime e operação. CFOP, CST/CSOSN, bases e alíquotas não serão um único valor universal fixado no produto.
4. Validar classificações e obrigatoriedade conforme operação. Não adivinhar NCM/tributação pelo nome “carregador” ou “película”.
5. Aproveitar o campo de tipo dos itens de venda, restringir valores válidos e validar referências da mesma empresa.
6. Preparar agrupamentos fiscais por serviço/mercadoria e regras aprovadas. Uma OS com peças não implica automaticamente emitir dois documentos sem avaliação do caso.
7. Calcular valores com precisão decimal e arredondamento definido; ratear descontos sem duplicar abatimentos entre documentos.
8. Guardar vínculo dos itens de venda com cada documento e controlar saldo já documentado para impedir faturamento fiscal duplicado.

**Aceite:** os exemplos aprovados pelo contador geram composição e valores corretos; dados faltantes impedem envio e apontam exatamente o campo a corrigir.

## 10. Etapa 6 — Processamento confiável

1. Criar contrato interno de provedor: consultar capacidades, validar conexão, emitir, consultar, cancelar e obter arquivos; cadastro/certificado são capacidades opcionais.
2. Implementar adaptador Notaas com tradução de campos/status e respostas reais de homologação. A documentação descreve emissão assíncrona; envio aceito não significa autorização. [Endpoints NFS-e](https://docs.notaas.com.br/docs/endpoints).
3. Registrar documento e trabalho pendente de modo durável. Usar transação para múltiplos registros ou desenho atômico de documento único; verificar suporte real do Mongo implantado antes de escolher.
4. Usar processamento com reserva temporária e retomada após reinício. Não depender de temporizadores ou fila apenas em memória.
5. Criar chave estável por operação. Duplo clique e repetição HTTP retornam a mesma solicitação.
6. Tratar o caso crítico: provedor aceitou, mas a conexão caiu antes de recebermos a resposta. Consultar/consolidar por referência ou idempotência suportada antes de reenviar. Sem garantia externa, colocar em conciliação manual, sem repetição cega.
7. Diferenciar falhas transitórias, cota excedida, erro de credencial e rejeição fiscal. Aplicar intervalos crescentes e limites nas novas tentativas seguras.
8. Receber webhook com assinatura obrigatória, verificar corpo original e autenticação antes de processar. Persistir recebimento antes da confirmação, deduplicar e mapear a empresa pela conexão conhecida. [Webhooks Notaas](https://docs.notaas.com.br/docs/webhooks).
9. Implementar consulta periódica para recuperar eventos perdidos e estados pendentes, respeitando cotas do provedor.
10. Obter XML/PDF/eventos em armazenamento privado e verificar integridade; restringir destinos externos de download. Falha no download não reemite a nota.
11. Proteger também o recebimento de eventos NF-e/NFC-e conforme seu contrato específico quando esses modelos forem implementados.

**Aceite:** duplo clique, timeout, reinício, retorno duplicado e evento fora de ordem não geram nota extra nem apagam uma autorização existente.

## 11. Etapa 7 — Fluxo completo de NFS-e

1. Na venda/OS, apresentar os serviços disponíveis para documentar e executar pré-validação no servidor.
2. Mostrar emitente, tomador, serviços, valores, competência e ambiente antes da confirmação.
3. Enviar e apresentar “processando” até a confirmação oficial; número, verificação e valores oficiais vêm da integração.
4. Mostrar rejeição com causa e orientação. Correção gera tentativa rastreável após verificar que a anterior não foi autorizada.
5. Liberar arquivos quando disponíveis, incluindo o caso de autorização anterior à geração do PDF.
6. Solicitar cancelamento com justificativa; aplicar restrições reais do município/provedor, acompanhar resultado e preservar nota e evento.
7. Tratar substituição quando necessária ao município piloto. Se não suportada na primeira versão, indicar procedimento externo e conciliar o resultado.
8. Separar efeito fiscal de estoque/financeiro: emitir ou cancelar NFS-e não duplica recebimento, não baixa estoque novamente e não estorna pagamento automaticamente.
9. Listar documentos por período, situação, venda e cliente; permitir exportação autorizada dos arquivos para o contador.

**Aceite:** emitir, consultar, baixar e cancelar em homologação, com conferência dos dados oficiais e dos totais dos exemplos aprovados.

## 12. Etapa 8 — Testes e piloto de serviços

| Grupo | Casos mínimos | Evidência exigida |
|---|---|---|
| Isolamento | Empresas A/B, troca de IDs, credenciais e download de arquivos | Requisições negadas e ausência de efeitos cruzados |
| Perfis | Mestre, admin_empresa, fiscal, gerente e operador | Cada ação respeita a matriz, inclusive chamada direta à API |
| Cadastro | Regimes distintos, campos condicionais e troca de configuração | Solicitações corretas, histórico preservado |
| Certificado | Senha incorreta, validade, identidade, renovação | Recusa segura ou confirmação sem segredo exposto |
| Valores | Decimais, descontos, arredondamento e serviços de venda mista | Valores enviados e oficiais conciliados |
| Concorrência | Cliques simultâneos, dois operadores e dois processadores | Uma operação fiscal por solicitação lógica |
| Falhas | Timeout antes/depois de aceitação, API indisponível e cota | Recuperação ou conciliação sem reemissão cega |
| Eventos | Assinatura falsa/ausente, duplicata e ordem invertida | Recusa ou tratamento idempotente |
| Fiscal | Autorização, rejeição, correção, cancelamento negado/aceito | Status e arquivos oficiais coerentes |
| Legado | Registro antigo, migração repetida e vínculo ausente | Preservação e nenhuma emissão acidental |
| Operação | Reinício, falha de armazenamento, backup e restauração | Retomada, integridade e acesso aos documentos |
| Carga | Cerca de 20 empresas fictícias concorrentes, com limites controlados | Fila estável, sem mistura de dados ou duplicidade |

Roteiro de execução:

1. Testes automatizados de domínio, permissões, adaptação e transições.
2. Testes de integração com Mongo em topologia compatível e provedor simulado, incluindo falhas entre gravação e envio.
3. Testes reais no ambiente fiscal de homologação; distinguir resultados reais daqueles apenas simulados.
4. Revisão de XML/documento auxiliar e tributação dos exemplos com o contador.
5. Exercício de restauração em ambiente isolado, com envio ao provedor desabilitado até reconciliar pendências; evitar reemissão após restaurar backup antigo.
6. Relatório com cenário, empresa/modelo/regime/localidade, resultado esperado/obtido, versão e evidência sem segredos.
7. Piloto em produção com operação comercial legítima e aprovação explícita do responsável, sem notas reais usadas apenas para teste.

**Aceite de NFS-e:** zero falhas críticas de isolamento, duplicidade e integridade; todas as jornadas obrigatórias aprovadas; escopo homologado documentado; recuperação demonstrada.

## 13. Etapa 9 — NFC-e e venda mista

1. Confirmar credenciamento, certificado e CSC conforme a UF piloto; manter CSC protegido e separar ambientes.
2. Complementar tributação, consumidor, meios de pagamento, troco, descontos e grupos obrigatórios do leiaute aplicável.
3. Emitir modelo 65 e apresentar XML, DANFE NFC-e e QR Code oficiais.
4. Implementar cancelamento e tratamento de numeração/inutilização conforme situações suportadas e regras vigentes.
5. Definir operação na indisponibilidade: sem contingência homologada, mostrar emissão pendente/indisponível e orientar o procedimento aprovado; nunca apresentar recibo comum como nota autorizada.
6. Venda mista: acompanhar NFS-e e documento de mercadorias independentemente. Se somente um for autorizado, manter sucesso parcial e tratar apenas o restante.
7. Testar os itens realmente vendidos: capinha, película, cabo e carregador, com classificações fornecidas e validadas.

**Aceite:** venda de mercadorias do piloto concluída com autorização real em homologação; pagamentos e estoque não duplicam; falha parcial da venda mista é recuperável.

## 14. Etapa 10 — NF-e

1. Priorizar operações do piloto: venda para empresa e demais situações em que o modelo 55 for aplicável.
2. Definir alcance por UF/destino e natureza de operação, incluindo transporte, frete, destinatário e informações adicionais necessárias.
3. Implementar tributação e validações das operações escolhidas, sem prometer cobertura automática de todas as operações interestaduais.
4. Obter XML autorizado, protocolo e DANFE; tratar rejeição e cancelamento.
5. Implementar devolução, referência à nota anterior, carta de correção e inutilização quando exigidos pelo escopo comercial; registrar explicitamente limitações ainda não atendidas.
6. Repetir testes fiscais, concorrência, eventos e falhas para modelo 55.

**Aceite:** cada operação anunciada foi homologada; operações ainda não suportadas são bloqueadas com explicação.

## 15. Etapa 11 — Implantação e manutenção

1. Publicar migração aditiva e backend compatível antes da nova interface. Manter emissão desligada por empresa/modelo até o aceite.
2. Implantar processamento, segredos, agendamentos e armazenamento nas stacks permanentes, para sobreviverem a atualizações dos serviços.
3. Verificar saúde e recuperação do banco/Swarm; não supor resolvidas as limitações de disponibilidade discutidas anteriormente.
4. Ativar primeiro uma empresa; ampliar por grupos somente após conciliar documentos e avaliar erros/cotas.
5. Monitorar documentos pendentes, rejeições, falhas de eventos, arquivos ausentes, certificado próximo do vencimento e consumo da API.
6. Ter procedimento de retorno de versão: interromper novas emissões, manter consulta/conciliação dos documentos enviados e preservar dados. Reverter código não desfaz nota já autorizada.
7. Definir retenção de XML e eventos com o responsável fiscal, cópia independente e teste periódico de restauração.
8. Definir tratamento de empresa suspensa: impedir novas emissões conforme política comercial, concluir a conciliação do que já foi enviado e preservar documentos. Não apagar projeto no provedor para bloquear acesso ao ERP.
9. Manter matriz de cobertura, versões dos leiautes e testes atualizados. Mudança tributária não deve alterar retroativamente documentos existentes.

**Aceite:** operação sabe identificar e resolver pendências, restaurar documentos, renovar certificado e interromper emissões sem perder rastreabilidade.

## 16. Marcos de entrega e próximas ações

| Marco | Etapas | O que pode ser apresentado ao cliente |
|---|---|---|
| A — Preparação fiscal | 0–5 | Cadastro fiscal, conexão e prontidão; emissão ainda não liberada |
| B — Serviços | 6–8 | NFS-e nas combinações comprovadamente homologadas |
| C — Varejo | 9 | NFC-e e venda mista no escopo aprovado |
| D — NF-e | 10 | NF-e nas operações homologadas |

A etapa 11 acompanha a liberação de cada marco, não apenas o último.

Primeiro lote de implementação: etapa 1, modelo e permissões da etapa 2, e formulário da etapa 3. Em paralelo ao levantamento técnico, concluir as definições da etapa 0. Integrações de produção não são pré-requisito para desenvolver essas telas e testes locais.

Informações necessárias antes dos testes reais:

- CNPJ piloto, município/UF, regime, inscrições e responsável fiscal.
- Conta/plano do provedor e disponibilidade das APIs necessárias.
- Certificado e credenciais fornecidos pelo fluxo seguro de configuração, nunca no repositório ou neste documento.
- Séries/numeração em uso e exemplos de operações validados pelo contador.
- Credenciamento e CSC, quando aplicáveis à emissão de mercadorias.

Estimativas de prazo devem ser feitas por lote após a etapa 0; disponibilidade do provedor, credenciamento e ajustes municipais são dependências externas. Nenhum percentual de código concluído substitui os critérios de aceite acima.
