# Homologação para venda — execução por fases

Solicitada pelo responsável após o deploy de backend `78a6d97` e frontend `5f23b03`. Ambos os workflows terminaram com sucesso. Resultados serão registrados separadamente; completar uma fase não significa aprovação das demais.

| Fase | Escopo | Critério |
|---|---|---|
| 0 | Versões, saúde, preparação e rastreabilidade | Imagens identificadas, API pronta, massa fictícia isolada |
| 1 | H01–H13, sessões, permissões e isolamento | Sem acesso entre empresas ou elevação de privilégios; correções reproduzidas na versão publicada |
| 2 | Atendimento, estoque, compras e financeiro | Saldos e estados consistentes sob concorrência, reenvio, estorno e fechamento |
| 3 | Uploads, documentos, assinaturas e entrega | Arquivos privados íntegros, autorização e metadados coerentes |
| 4 | Backup, recuperação e falhas | Recuperação isolada de banco e arquivos; nenhuma gravação parcial no teste descartável |
| 5 | Capacidade e experiência de uso | Carga gradual com métricas, limite de interrupção e volume explicitamente registrado |
| 6 | Integrações e aceite operacional | Provedores de teste e escopo definidos; piloto humano com aceite |

## Regras da execução

- Prefixo único por execução; criação somente de empresas e registros fictícios. Nenhuma cobrança, emissão fiscal ou mensagem externa real.
- Segredos recebidos em memória; relatórios não incluem senhas nem tokens.
- Testes antigos com IDs fixos não serão reexecutados.
- Requisições de concorrência limitadas. A fase de carga interrompe ao observar falhas sustentadas ou latência excessiva; não constitui teste destrutivo de saturação.
- Respeitar o limite real de login; não falsificar IP nem desativar controles para acelerar testes.
- Falhas induzidas e restaurações somente em instâncias descartáveis, sem sobrescrever o banco em uso.
- Limpeza limitada a usuários/mídias fictícios criados pela rodada; empresas desativadas e histórico preservado quando a API não oferece exclusão física segura.
- Integrações sem configuração de homologação e aceite humano serão marcados como bloqueados, nunca como aprovados por simulação.

## Estado ao encerrar a rodada

Rodada encerrada em 21/09/2026. Fases 0–5 executadas nos cenários descritos, com reprovações e limites; fase 6 depende de provedores de homologação e aceite humano. **Não liberado para venda geral.**

Resultados, reprodução dos defeitos e tarefas restantes: [relatório da execução](resultados-homologacao-fases-2026-09-21.md). Foram desativadas 20 empresas fictícias e removidos 30 usuários de teste, sem erros retornados nessa limpeza.
