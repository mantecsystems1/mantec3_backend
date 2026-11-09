# API fiscal própria — estrutura e roteiro de implementação

Data: 11/10/2026. Estado: planejamento; nenhuma API criada, dependência instalada ou publicação executada nesta tarefa.

Este plano substitui a escolha de integração Notaas do plano fiscal anterior para o escopo atual. Reaproveita seus cuidados com isolamento, legado, documentos e testes. A primeira versão será uma API separada do ERP, para uso interno da Mantec Informática. A comercialização para outras empresas não integra esta primeira entrega.

## 1. Contexto e limites da primeira versão

- Emitente piloto informado: CNPJ 27.737.565/0001-02, Matão/SP; enquadramento MEI informado pelo usuário, ainda a confirmar em fonte oficial atual.
- O usuário já utiliza o Emissor Nacional manualmente e não possui certificado A1.
- Há possibilidade de desenquadramento do SIMEI, a ser definida com contador. Não assumir data, regime futuro ou alíquotas.
- Há um cluster disponível, administrado por stacks Docker Swarm. Capacidade, volumes, topologia e disponibilidade atuais ainda precisam ser verificados.
- Primeira entrega: NFS-e Nacional de serviços, com emissão, consulta, XML, documento auxiliar e cancelamento quando permitido.
- NF-e/NFC-e de mercadorias serão entregas posteriores, com configuração e homologação próprias em SP.
- Fora da primeira versão: venda pública da API, cobrança por uso, filiais, painel independente, todos os municípios e todos os regimes, emissão em lote e aplicativos móveis.
- Identificação de sistema consumidor e emitente será obrigatória desde o começo; começar com uma empresa não justifica acesso irrestrito aos dados.

## 2. Arquitetura escolhida

```text
Navegador do Mantec
        |
Backend do ERP -- HTTPS / credencial de serviço --> API fiscal
        ^                                           |
        |                                           v
        |                                 MongoDB fiscal + pendência durável
        |                                           |
        |                                     Redis / BullMQ
        |                                           |
        |                                           v
        |                                    Processador fiscal
        |                                     /             \
        |                             Certificados       API oficial
        |                             protegidos         SEFIN / SEFAZ
        |                                           |
        +--- notificação assinada / consulta -------+
                                                    |
                                               XML / PDF privados
```

Um repositório, dois pontos de entrada e módulos compartilhados: `api` e `worker`. Não criar um microsserviço para cada função. A fila não será a única cópia de uma solicitação: o banco guarda a intenção de processamento antes de confirmar o recebimento ao ERP.

Responsabilidades:

| Componente | Autoridade sobre os dados |
|---|---|
| ERP | Clientes, catálogo, vendas, estoque e pagamentos |
| API fiscal | Solicitações, configuração fiscal versionada, numeração controlada por ela, autorização e eventos |
| Órgão autorizador | Resultado oficial e validade fiscal |
| Contador/responsável | Definição e validação da classificação e tributação aplicáveis |

O ERP envia uma cópia dos dados necessários. A API não consulta o banco do ERP e não altera estoque ou pagamentos. O ERP guarda referências aos documentos e uma cópia de seu estado para exibição.

## 3. Linguagens e tecnologias

| Camada | Tecnologia proposta | Motivo / condição |
|---|---|---|
| Linguagem principal | TypeScript, modo estrito | Mesma linguagem do backend atual, contratos explícitos |
| Execução | Node.js 24 LTS | Linha LTS disponível na consulta; fixar patch suportado ao iniciar |
| Framework | NestJS 11, sujeito à validação de compatibilidade | Aproveitar experiência do ERP sem acoplar os projetos |
| API | REST, JSON, OpenAPI/Swagger | Contrato documentado e versionado em `/v1` |
| Banco | MongoDB + Mongoose | Reaproveitar tecnologia conhecida, com banco lógico e usuário exclusivos |
| Fila | BullMQ + Redis dedicado à fila | Processamento separado, atrasos e controle de tentativas |
| Valores monetários | Decimal128 no banco e `decimal.js` no domínio | Não usar ponto flutuante comum para cálculos fiscais; JSON com valores decimais em strings |
| XML | `xmlbuilder2`; validação XSD com libxml2 | Gerar namespaces corretamente e validar os esquemas oficiais |
| Assinatura | `xml-crypto`, candidato sujeito à prova técnica | Verificar compatibilidade com XMLDSig e canonicalização exigidos |
| Certificados e comunicação | OpenSSL e módulos `crypto`, `tls` e `https` do Node.js | PKCS#12/A1, criptografia e autenticação mútua |
| Arquivos | Armazenamento privado compatível com S3 | XML, documento auxiliar, eventos e cópias de segurança |
| Testes | Jest, Supertest, serviços locais em contêineres e simulador HTTP | Domínio, API, fila, banco e falhas reproduzíveis |
| Interface | React/TypeScript do Mantec | Configuração e operação pelo ERP; sem outro painel inicialmente |
| Publicação | Docker, Docker Swarm, YAML e GitHub Actions | Integrar ao fluxo de stacks existente |
| Observabilidade | Logs JSON com correlação, health checks e métricas | Reaproveitar ferramentas disponíveis no cluster antes de adicionar outras |

Não introduzir PHP/Python na primeira implementação. Bibliotecas fiscais prontas de outras linguagens podem ser avaliadas posteriormente se houver vantagem comprovada.

Versões e licenças serão verificadas e fixadas no primeiro lote, com arquivo de dependências travado. Não há recomendação de atualizar automaticamente o ERP para essas versões. A escolha das bibliotecas XML/PKCS#12 depende de validar assinatura e documento em prova técnica, não apenas de instalar os pacotes.

Referências das escolhas: [Node LTS](https://nodejs.org/en/about/previous-releases), [filas NestJS](https://docs.nestjs.com/techniques/queues), [BullMQ em produção](https://docs.bullmq.io/guide/going-to-production), [XMLDSig](https://github.com/node-saml/xml-crypto), [atomicidade no MongoDB](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).

## 4. Estrutura proposta do projeto

Nome provisório: `mantec-fiscal-api`. A estrutura abaixo é um desenho, ainda não criada no disco.

```text
mantec-fiscal-api/
├── apps/
│   ├── api/src/                   # HTTP, autenticação, DTOs e documentação
│   │   ├── main.ts
│   │   └── app.module.ts
│   └── worker/src/                # Emissão, consulta, conciliação e notificações
│       ├── main.ts
│       └── worker.module.ts
├── libs/
│   ├── domain/src/                # Regras e estados, sem dependência de HTTP
│   │   ├── emitters/
│   │   ├── fiscal-profiles/
│   │   ├── documents/
│   │   ├── numbering/
│   │   └── events/
│   ├── application/src/           # Casos de uso e interfaces das dependências
│   │   ├── use-cases/
│   │   └── ports/
│   ├── integrations/src/
│   │   ├── nfse-nacional/         # Primeiro conector real
│   │   ├── simulated/             # Respostas determinísticas para testes
│   │   └── sefaz-sp/              # Apenas nas fases de NF-e/NFC-e
│   ├── infrastructure/src/
│   │   ├── database/
│   │   ├── queue/
│   │   ├── xml/
│   │   ├── certificates/
│   │   ├── storage/
│   │   ├── webhooks/
│   │   └── observability/
│   └── security/src/              # Credenciais, escopos, acesso e auditoria
├── schemas/nfse/                 # XSDs oficiais com versão e origem
├── test/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── e2e/
│   └── fixtures/                 # Dados e certificados sintéticos; nunca reais
├── scripts/                      # Índices, migrações e verificações operacionais
├── deploy/
│   ├── compose.dev.yml
│   ├── stack.homolog.yml
│   └── stack.prod.yml
├── docs/
│   ├── architecture.md
│   ├── api-contract.md
│   ├── homologation.md
│   ├── implementation-progress.md
│   └── runbooks/                 # Operação, certificado, backup e incidentes
├── .github/workflows/ci.yml
├── .github/workflows/deploy.yml
├── .env.example                  # Nomes de parâmetros, sem valores secretos
├── Dockerfile
├── package.json
├── package-lock.json
├── nest-cli.json
├── tsconfig.json
└── README.md
```

## 5. Contrato e dados mínimos

Rotas propostas, a consolidar na etapa 1:

| Operação | Rota |
|---|---|
| Cadastrar/consultar emitente | `POST /v1/emitters`, `GET /v1/emitters/:id` |
| Configurar regime e vigência | `POST /v1/emitters/:id/fiscal-profiles` |
| Enviar/substituir A1 | `POST /v1/emitters/:id/certificates` |
| Consultar metadados do A1 | `GET /v1/emitters/:id/certificate-status` |
| Pré-validar emissão | `POST /v1/nfse/validate` |
| Solicitar emissão | `POST /v1/nfse` com `Idempotency-Key` |
| Consultar resultado | `GET /v1/documents/:id` |
| Solicitar cancelamento | `POST /v1/documents/:id/cancellation-requests` |
| Obter arquivos autorizados | `GET /v1/documents/:id/files/:type` |
| Consultar saúde | `/health/live`, `/health/ready` |

Regras do contrato:

- Credencial identifica o sistema consumidor e os emitentes autorizados. O navegador não recebe essa credencial; o backend do ERP chama a API.
- Escopos distintos para cadastro, certificado, emissão, consulta e cancelamento. Credenciais podem ser revogadas/rotacionadas.
- ID externo de venda/OS é referência, não autorização de acesso nem número fiscal.
- Emissão aceita devolve HTTP 202, identificador da operação e estado pendente; não promete autorização.
- Mesma chave e mesmo conteúdo retornam a mesma operação; mesma chave com conteúdo diferente retorna conflito.
- Ambientes e modos são explícitos: `simulado`, `homologacao`, `producao`. Simulado nunca aparece como autorização fiscal nem é ativado como substituto automático de produção.
- Dados oficiais e dados locais têm campos distintos. Identificador da DPS não será exibido como número da NFS-e.
- Webhook para o ERP possui ID, versão do evento, assinatura e tentativas. ERP deduplica eventos e pode consultar o estado vigente.
- A API oficial pode responder de forma síncrona; o processamento assíncrono é nossa escolha para confiabilidade. Não presumir webhook do governo.

Coleções propostas: sistemas consumidores, credenciais, emitentes, perfis fiscais versionados, metadados de certificados, documentos fiscais, contadores, tentativas, eventos, entregas de webhook, metadados de arquivos e auditoria.

Todos os recursos pertencem explicitamente a um sistema consumidor e emitente. Índices únicos incluem ambiente e contexto correto. Perfil fiscal é escolhido por vigência e regras da operação; uma alteração posterior não modifica o documento já emitido.

## 6. Etapas de execução

### Etapa 0 — Confirmar piloto e mapear o cluster

1. Confirmar cadastro atual do CNPJ, regime, atividade e emissão já utilizada; obter exemplos de serviço e documentos anteriores sem copiar dados desnecessários.
2. Identificar séries/numeração utilizadas pelo emissor atual. Planejar coexistência sem colisões.
3. Com o contador, registrar o tratamento fiscal dos serviços e eventual mudança de regime; ausência de definição não bloqueia testes locais, mas bloqueia configuração definitiva de produção.
4. Inventariar cluster, recursos, volumes, armazenamento e backup de forma somente leitura. Verificar compatibilidade dos nós e saúde real do Mongo/Swarm.
5. Definir domínio, redes, locais de persistência e responsáveis. Endereço e nomes de secrets serão confirmados antes da publicação.

Entrega: ficha do piloto, inventário e decisões. Aceite: escopo inicial definido e dependências externas identificadas. Sem certificado é possível concluir esta etapa.

### Etapa 1 — Criar projeto e contrato

1. Criar repositório e estrutura API/worker; configurar TypeScript estrito, lint, build, testes e documentação.
2. Definir OpenAPI, códigos de erro, autenticação e contratos com o Mantec.
3. Subir desenvolvimento local com Mongo e Redis, sem credenciais reais nem acesso de emissão à produção.
4. Implementar adaptador simulado com autorização, rejeição, atraso e falha de rede determinísticos.

Entrega: API local documentada. Aceite: build/CI aprovados e primeira solicitação simulada rastreável. Não exige A1.

### Etapa 2 — Emitente, isolamento e perfil fiscal

1. Cadastrar emitente, vínculos e credenciais com escopos; armazenar somente hash das credenciais de entrada quando possível.
2. Implementar configuração fiscal com período de vigência e trilha de alteração.
3. Validar dados e impedir acesso a emitente alheio por ID, arquivo, listagem ou tarefa da fila.
4. Guardar snapshot dos dados usados por documento; preparar mudança de MEI sem regras de impostos fixadas no código.

Entrega: configuração fiscal segura. Aceite: testes com consumidores/emitentes A e B comprovam isolamento; mudança de perfil preserva passado. Não exige A1.

### Etapa 3 — Certificados, assinatura e XML

1. Implementar upload com limites e leitura de PKCS#12; validar senha, validade, cadeia e identidade exigida pelo serviço.
2. Provar geração XML, namespaces, validação XSD, assinatura e verificação independente com material sintético.
3. Proteger A1 e senha/chave privada com criptografia autenticada e versionamento de chave; chave mestra fora do banco/armazenamento. Definir recuperação dessa chave separadamente dos backups de dados.
4. Permitir descriptografia somente no processador que necessita assinar; remover temporários. Não passar senha em linha de comando/logs.
5. Impedir XXE/acesso externo no parser e validador; arquivos XSD vêm de pacote oficial versionado.
6. Exibir somente metadados e situação, com troca/renovação e alertas.

Entrega: infraestrutura de certificados testada. Aceite local: assinatura verificável e nenhum segredo exposto. Aceite oficial depende do A1 real e ambiente do órgão.

### Etapa 4 — Processamento durável, numeração e idempotência

1. Gravar solicitação, chave de idempotência, estado e pendência de trabalho no mesmo documento Mongo, aproveitando atomicidade de documento único.
2. Despachar a pendência para BullMQ; processo de reconciliação recupera o intervalo entre gravar no banco e inserir na fila. ID estável evita duplicar trabalho.
3. Reservar processamento com controle de concorrência, prazo e versão. Entrega é pelo menos uma vez: todo efeito deve suportar repetição segura.
4. Reservar numeração atomicamente no contexto correto de emitente/modelo/série/ambiente. Registrar reserva antes do envio; não reutilizar automaticamente lacunas ou números após falha.
5. Operações que exigirem transação entre coleções só serão adotadas após verificar suporte e disponibilidade reais; nunca manter transação aberta durante chamada ao governo.
6. Após timeout ou queda depois do envio, consultar por identificação oficial antes de reenviar. Sem resultado conclusivo, manter pendência para conciliação.
7. Configurar Redis com persistência e política sem expulsão de chaves; fila contém referências, não certificados nem payload fiscal completo. Reconstruir trabalhos pelo banco em caso de perda da fila.

Entrega: simulador resiste a falhas. Aceite: cliques concorrentes, reinício e Redis indisponível não perdem solicitações nem repetem efeito fiscal.

### Etapa 5 — Conector NFS-e Nacional

1. Fixar documentos oficiais, XSDs e parâmetros vigentes; manter URLs de homologação/produção configuradas no servidor, fora do controle do usuário.
2. Montar DPS a partir dos dados validados; configurar mTLS e assinatura conforme requisitos do serviço.
3. Implementar consulta de parâmetros, envio, consulta por DPS/chave e interpretação das rejeições.
4. Tratar timeout e consulta posterior; registrar XML exato transmitido e recebido, hash, tentativa e correlação em local protegido.
5. Mapear estados oficiais, sem confundir rejeição de negócio com falha técnica.
6. Suportar os campos necessários ao cenário MEI piloto; demais perfis entram somente após parametrização e testes próprios, incluindo campos vigentes de IBS/CBS quando aplicáveis.

Entrega: conector real implementado. Aceite local: contratos e cenários simulados aprovados. Aceite oficial: testes de produção restrita com certificado válido. Sem A1, registrar homologação como pendente, nunca como concluída.

### Etapa 6 — Documentos, cancelamento e retorno ao ERP

1. Guardar XML autorizado e eventos em armazenamento privado, com integridade e vínculo ao emitente.
2. Obter DANFSe pelo mecanismo oficial disponível. Se houver geração local, validar leiaute e dados; não apresentar PDF improvisado como documento oficial.
3. Separar autorização de disponibilidade dos arquivos. Falha na obtenção do PDF não dispara nova emissão.
4. Solicitar cancelamento com justificativa, acompanhar aceite/rejeição e preservar original. Implementar substituição ou documentar sua limitação para o piloto.
5. Enviar webhook assinado ao ERP, com repetição limitada e idempotência. Destinos são previamente autorizados; bloquear SSRF e redirecionamentos não permitidos.
6. Não apagar nota autorizada nem permitir editar seu conteúdo. Revisões/reemissões têm vínculo e histórico.

Entrega: ciclo fiscal completo. Aceite: emissão, arquivos e cancelamento simulados; os mesmos fluxos aprovados no ambiente oficial quando o certificado estiver disponível.

### Etapa 7 — Integrar ao Mantec

1. Backend do ERP conecta a API com credencial própria, preservando suas permissões por usuário.
2. Minha Empresa recebe configuração fiscal, situação do A1 e indicadores de prontidão.
3. Na venda/OS, mostrar pré-validação e confirmação da emissão; enviar apenas serviços elegíveis no primeiro lote.
4. Exibir situação real, rejeições e arquivos. Remover número aleatório, verificação inventada e impostos fixos existentes na tela atual.
5. Marcar registros anteriores como manuais/legados, sem emiti-los ou convertê-los em autorização automaticamente.
6. Impedir duplicidade pela venda/itens já documentados; não duplicar baixa de estoque ou pagamento.
7. Receber eventos e recuperar notificações perdidas por consulta. Não iniciar chamadas diretas do navegador aos serviços oficiais.

Entrega: emitir a partir do ERP sem redigitação. Aceite: jornada completa no modo simulado e depois na homologação oficial; usuário sem permissão não consegue emitir por chamada direta.

### Etapa 8 — Publicar homologação no cluster e testar recuperação

1. Publicar stack fiscal própria com API, worker e Redis; banco/armazenamento podem ser serviços existentes após validar capacidade, com credenciais e espaços separados.
2. Iniciar com uma réplica da API e uma do worker; não replicar banco/Redis alterando apenas `replicas`. Configurar volumes e restrições de posicionamento.
3. Manter banco, Redis e worker em rede privada, sem portas públicas. HTTPS no ingresso e saída mTLS para os órgãos.
4. Configurar secrets, limites de recursos, health checks, métricas e alertas.
5. Configurar CI/CD com imagens por commit, dependências fixadas e stacks versionadas. Publicação de produção será separada da homologação.
6. Testar backup/restauração de banco, arquivos e chaves. Após restauração, manter emissões suspensas até conciliar com o órgão o período posterior ao backup.
7. Testar indisponibilidade do banco, Redis, armazenamento e do órgão; documentar limites de disponibilidade dos dois servidores atuais.

Entrega: homologação operacional. Aceite: persistência após atualização, recuperação comprovada e ausência de segredos nos logs. Sem A1, usar simulador claramente identificado; não considerar integração oficial homologada.

### Etapa 9 — Homologação oficial e piloto em produção

Dependências: A1 real, dados fiscais confirmados, configuração vigente e requisitos de acesso/credenciamento verificados.

1. Executar cenários reais autorizados no ambiente de produção restrita: emissão, consulta, rejeição, arquivos e eventos permitidos.
2. Conferir XML e representação visual com o contador/responsável; testar valores, competência, enquadramento e numeração.
3. Separar evidência simulada de evidência oficial; documentar versão do código, leiaute e configuração.
4. Liberar produção explicitamente para o CNPJ piloto, após autorização do responsável. Primeira nota deve corresponder a operação comercial real.
5. Conferir resultado no portal oficial e conciliar com o ERP.
6. Preservar emissão manual como procedimento operacional documentado, com séries/numeração coordenadas e importação/conciliação de documentos externos.

Entrega: NFS-e em produção para a assistência. Aceite: nenhum problema crítico de isolamento, duplicidade ou integridade; nota legítima autorizada e recuperável; procedimento de suporte definido.

### Etapa 10 — Mercadorias e mudança de regime

1. Com o contador, confirmar inscrições, credenciamento e regras para NF-e/NFC-e em SP, certificado, CSC e eventual identificação do responsável técnico.
2. Implementar campos de produto, perfis de operação, tributos, pagamento/troco, numeração, DANFE e QR Code aplicáveis.
3. Adicionar conector SEFAZ-SP, consultas e eventos; tratar contingência apenas quando implementada e homologada.
4. Implementar cancelamento, inutilização e demais eventos necessários ao escopo; não assumir que todo evento de NF-e é válido em NFC-e.
5. Homologar NFC-e e NF-e separadamente. Venda mista acompanha documentos independentes e resultados parciais sem repetir os já autorizados.
6. Quando houver mudança de SIMEI/regime, criar perfil com vigência, revisar habilitação/campos e homologar exemplos antes da primeira emissão sob o novo enquadramento.

Entrega: emissão de mercadorias e enquadramentos adicionais comprovadamente testados. A mudança de regime pode exigir este trabalho antes da expansão para mercadorias, conforme a data definida pelo contador.

## 7. Matriz mínima de testes

| Área | Critério |
|---|---|
| Acesso | Chave inválida/revogada e emitente não autorizado são recusados |
| Certificado | Senha errada, arquivo adulterado, vencimento e identidade incompatível são tratados |
| XML | XSD, assinatura, namespaces, caracteres, limites de tamanho e parser seguro |
| Valores | Decimais, descontos, arredondamento e totais consistentes |
| Idempotência | Mesmo pedido concorrente gera uma operação; conteúdo diferente conflita |
| Estado | Eventos atrasados não revertem autorização/cancelamento; falha técnica não vira rejeição fiscal |
| Recuperação | Queda antes/depois de transmitir exige consulta, sem repetição cega |
| Arquivos | Download exige autorização; XML íntegro e recuperação independente da fila |
| ERP | Sem duplicar efeitos financeiros/estoque; legado preservado |
| Infraestrutura | Reinício, perda da fila, restauração e rotação de segredos testados |
| Regime | Alteração preserva histórico e aplica perfil correto às novas operações |

## 8. Marcos e dependências externas

| Marco | Conteúdo | Precisa de certificado real? |
|---|---|---|
| A | Etapas 0–4, base e processamento simulado | Não |
| B | Etapas 5–7, integração implementada e testada localmente | Não para simulação; sim para comprovar comunicação oficial |
| C | Etapa 8, ambiente de homologação publicado | Não para infraestrutura; sim para emissão oficial de teste |
| D | Etapa 9, primeira entrega real de NFS-e | Sim |
| E | Etapa 10, NFC-e/NF-e e outros enquadramentos | Sim, além das habilitações aplicáveis |

Ordem inicial: 0 → 1 → 2 → 3 → 4. O conector real, o retorno ao ERP e a interface seguem depois. Se o A1 não estiver disponível, avançar nos testes simulados e na infraestrutura; não fabricar evidência de homologação oficial.

Cada etapa deve atualizar `docs/implementation-progress.md` no futuro repositório, indicando separadamente: implementado, testado localmente, homologado oficialmente e publicado. Prazos serão estimados por lote após inventário e prova de assinatura; não atribuir tempo fixo a credenciamento ou análise contábil.

## 9. Operação e custos

- Aproveitar o cluster reduz o custo adicional de hospedagem, mas exige verificar capacidade e persistência.
- Continuam existindo aquisição/renovação do certificado, armazenamento/backup, manutenção de dependências e atualizações fiscais.
- Não incluir mensalidade de intermediária fiscal neste desenho.
- Armazenamento S3 significa protocolo compatível; não obriga contratar AWS nem pressupõe que já haja serviço disponível no cluster.
- Chaves de criptografia e arquivos fiscais precisam sobreviver à perda de um nó. Cópia no mesmo disco não é plano de recuperação.
- Desligar novas emissões deve manter consulta e conciliação de solicitações já enviadas. Reverter código não desfaz documento autorizado.

## 10. Fontes oficiais para a implementação

- [Documentação vigente NFS-e](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual): manuais, esquemas e leiautes.
- [Endereços de homologação e produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao): separar ambientes e confirmar URLs antes de integrar.
- [Emissão do MEI pela API](https://www.gov.br/nfse/pt-br/nt-2023-001-obrigatoriedade-da-nfs-e-nacional-para-o-mei.pdf): certificado e fluxo nacional.
- [Credenciamento NF-e SP](https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/PaginaGuiaDoUsuario.aspx).
- [Portal NFC-e SP](https://portal.fazenda.sp.gov.br/servicos/nfce/).

As fontes são referências; requisitos vigentes devem ser reconferidos na implementação e na habilitação de produção. O plano não confirma a situação cadastral do emitente nem sua autorização atual de emissão de mercadorias.
