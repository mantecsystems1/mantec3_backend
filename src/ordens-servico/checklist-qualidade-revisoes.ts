import { CHECKLIST_QUALIDADE_ROTULOS, codigosChecklistQualidade } from './checklist-qualidade';

export type ResultadoChecklistQualidade = 'aprovado' | 'falha' | 'nao_aplicavel';

export interface ChecklistQualidadeRevisaoItem {
  codigo: string;
  resultado: ResultadoChecklistQualidade;
  observacao?: string;
}

export interface ChecklistQualidadeRevisao {
  revisao: number;
  data?: string;
  evento: string;
  responsavel?: string;
  motivo?: string;
  categoriaEquipamento?: string;
  itens: ChecklistQualidadeRevisaoItem[];
  legado: boolean;
  fonteIndisponivel?: boolean;
}

export interface ChecklistQualidadeRevisaoResumo extends Omit<ChecklistQualidadeRevisao, 'itens'> {
  totalItens: number;
  totalEsperado: number;
  falhas: number;
  pendentes: number;
  situacao: string;
}

type RecordValue = Record<string, unknown>;

const asRecord = (value: unknown): RecordValue | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;

const rotulosParaCodigos = new Map(
  Object.entries(CHECKLIST_QUALIDADE_ROTULOS).map(([codigo, rotulo]) => [rotulo, codigo]),
);

const normalizarItem = (value: unknown): ChecklistQualidadeRevisaoItem | undefined => {
  const item = asRecord(value);
  if (!item || typeof item.codigo !== 'string' || !item.codigo.trim() || item.codigo.length > 80) return undefined;
  if (!['aprovado', 'falha', 'nao_aplicavel'].includes(String(item.resultado))) return undefined;
  const observacao = typeof item.observacao === 'string' ? item.observacao.trim().slice(0, 500) : '';
  return {
    codigo: item.codigo,
    resultado: item.resultado as ResultadoChecklistQualidade,
    ...(observacao ? { observacao } : {}),
  };
};

function lerItensEstruturados(value: unknown): ChecklistQualidadeRevisaoItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(normalizarItem).filter((item): item is ChecklistQualidadeRevisaoItem => Boolean(item));
}

const dataIso = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const data = new Date(String(value));
  return Number.isNaN(data.getTime()) ? undefined : data.toISOString();
};

function lerItensLegados(value: unknown): ChecklistQualidadeRevisaoItem[] {
  if (typeof value !== 'string' || !value.trim()) return [];

  const separador = / · (?=[^·:]+: (?:Aprovado|Falha|Não se aplica)(?: \(|$))/g;
  return value.split(separador).flatMap((trecho) => {
    const divisor = trecho.indexOf(': ');
    if (divisor < 0) return [];
    const codigo = rotulosParaCodigos.get(trecho.slice(0, divisor).trim());
    if (!codigo) return [];
    const detalhe = trecho.slice(divisor + 2).trim();
    const resultadoMatch = /^(Aprovado|Falha|Não se aplica)(?: \((.*)\))?$/.exec(detalhe);
    if (!resultadoMatch) return [];
    const resultado: ResultadoChecklistQualidade = resultadoMatch[1] === 'Aprovado'
      ? 'aprovado'
      : resultadoMatch[1] === 'Falha' ? 'falha' : 'nao_aplicavel';
    const observacao = resultadoMatch[2]?.trim();
    return [{ codigo, resultado, ...(observacao ? { observacao } : {}) }];
  });
}

function nomeResponsavel(value: unknown): string | undefined {
  const usuario = asRecord(value);
  if (usuario) {
    const nome = typeof usuario.nome === 'string' ? usuario.nome.trim() : '';
    const email = typeof usuario.email === 'string' ? usuario.email.trim() : '';
    return nome || email || undefined;
  }
  if (typeof value === 'string' && !/^[a-f\d]{24}$/i.test(value)) return value.trim() || undefined;
  return undefined;
}

function numeroRevisao(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

export function reconstruirRevisoesChecklistQualidade(
  eventos: unknown[],
  atual?: {
    revisao?: number;
    data?: Date | string;
    responsavel?: unknown;
    categoriaEquipamento?: string;
    itens?: unknown;
    motivo?: string;
  },
): ChecklistQualidadeRevisao[] {
  const eventosChecklist = eventos
    .map(asRecord)
    .filter((evento): evento is RecordValue => Boolean(evento))
    .filter((evento) => evento.tipoEvento === 'OS_CHECKLIST_QUALIDADE_ATUALIZADO' || evento.tipoEvento === 'OS_CHECKLIST_QUALIDADE_CORRIGIDO')
    .sort((a, b) => new Date(String(a.data || 0)).getTime() - new Date(String(b.data || 0)).getTime());

  const revisoesPorNumero = new Map<number, ChecklistQualidadeRevisao>();
  let sequencia = 0;
  for (const evento of eventosChecklist) {
    const dados = asRecord(evento.dados) || {};
    const revisao = numeroRevisao(dados.revisaoAtual) || sequencia + 1;
    sequencia = Math.max(sequencia, revisao);
    const itensEstruturados = lerItensEstruturados(dados.checklistAtualItens);
    const legado = !itensEstruturados;
    const itens = itensEstruturados || lerItensLegados(dados.checklistAtual);
    const data = dataIso(evento.data);
    const tipoEvento = String(evento.tipoEvento || '');
    revisoesPorNumero.set(revisao, {
      revisao,
      ...(data ? { data } : {}),
      evento: tipoEvento,
      ...(nomeResponsavel(evento.usuarioId) ? { responsavel: nomeResponsavel(evento.usuarioId) } : {}),
      ...(typeof dados.motivo === 'string' && dados.motivo.trim() ? { motivo: dados.motivo.trim() } : {}),
      ...(typeof dados.categoriaEquipamento === 'string' ? { categoriaEquipamento: dados.categoriaEquipamento } : {}),
      itens,
      legado,
    });
  }

  if (atual) {
    const revisao = numeroRevisao(atual.revisao);
    if (revisao && !revisoesPorNumero.has(revisao)) {
      const data = dataIso(atual.data);
      revisoesPorNumero.set(revisao, {
        revisao,
        ...(data ? { data } : {}),
        evento: 'OS_CHECKLIST_QUALIDADE_ATUAL',
        ...(nomeResponsavel(atual.responsavel) ? { responsavel: nomeResponsavel(atual.responsavel) } : {}),
        ...(atual.motivo ? { motivo: atual.motivo } : {}),
        ...(atual.categoriaEquipamento ? { categoriaEquipamento: atual.categoriaEquipamento } : {}),
        itens: lerItensEstruturados(atual.itens) || [],
        legado: true,
        fonteIndisponivel: true,
      });
    }
  }

  return [...revisoesPorNumero.values()].sort((a, b) => a.revisao - b.revisao);
}

export function resumirRevisaoChecklistQualidade(
  revisao: ChecklistQualidadeRevisao,
  categoriaEquipamento?: string,
  tipoEquipamento?: string,
): ChecklistQualidadeRevisaoResumo {
  const { itens, ...metadados } = revisao;
  const esperados = codigosChecklistQualidade(revisao.categoriaEquipamento || categoriaEquipamento, tipoEquipamento);
  const contagem = new Map<string, number>();
  itens.forEach((item) => contagem.set(item.codigo, (contagem.get(item.codigo) || 0) + 1));
  const falhas = itens.filter((item) => item.resultado === 'falha').length;
  const pendentes = esperados.filter((codigo) => !contagem.has(codigo)).length;
  const duplicados = esperados.some((codigo) => (contagem.get(codigo) || 0) > 1);
  const codigosEsperados = new Set<string>(esperados);
  const extras = [...contagem.keys()].some((codigo) => !codigosEsperados.has(codigo));
  const situacao = pendentes || duplicados || extras
    ? 'Registro parcial'
    : falhas ? 'Concluído com falha registrada' : 'Concluído sem falhas';
  return {
    ...metadados,
    totalItens: itens.length,
    totalEsperado: esperados.length,
    falhas,
    pendentes,
    situacao,
  };
}
