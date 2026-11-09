import { ClientSession, Connection, Types } from 'mongoose';
import { Pagamento, PagamentoSchema } from '../pagamentos/schemas/pagamento.schema';
import { MovimentoCaixa, MovimentoCaixaSchema } from '../financeiro-adm/schemas/movimento-caixa.schema';
import { dinheiroParaCentavos } from '../financeiro-adm/financeiro-adm.types';

export function executarTransacaoFinanceira<T>(db: Connection, work: () => Promise<T>): Promise<T> {
  const base = db.base as unknown as {
    transactionAsyncLocalStorage?: { getStore: () => { session?: ClientSession } | undefined };
  };
  return base?.transactionAsyncLocalStorage?.getStore()?.session ? work() : db.transaction(work);
}

/** Legacy payments without a cash link remain valid; linked payments require confirmed cash. */
export async function listarPagamentosValidos(
  db: Connection,
  vendaId: string,
  empresaId: string,
  ignoredPagamentoId?: string,
) {
  const pagamentos = await listarPagamentosValidosDasVendas(db, [vendaId], empresaId);
  return ignoredPagamentoId
    ? pagamentos.filter(pagamento => String(pagamento._id) !== ignoredPagamentoId)
    : pagamentos;
}

export async function listarPagamentosValidosDasVendas(db: Connection, vendaIds: string[], empresaId: string) {
  const ids = vendaIds.filter(Types.ObjectId.isValid).map(vendaId => new Types.ObjectId(vendaId));
  if (!ids.length) return [];
  const pagamentosModel = db.models.Pagamento ?? db.model<Pagamento>('Pagamento', PagamentoSchema);
  const movimentosModel = db.models.MovimentoCaixa ?? db.model<MovimentoCaixa>('MovimentoCaixa', MovimentoCaixaSchema);
  const pagamentos = await pagamentosModel.find({ vendaId: { $in: ids } }).lean().exec();
  const linkedIds = pagamentos.flatMap(p => p.movimentoCaixaId ? [p.movimentoCaixaId] : []);
  const movimentos = linkedIds.length
    ? await movimentosModel.find({ _id: { $in: linkedIds }, empresaId, status: 'confirmado', origemTipo: 'pagamento_venda' }).lean().exec()
    : [];
  const validos = new Map(movimentos.map(m => [String(m._id), m]));
  return pagamentos.filter(pagamento => {
    const movimento = pagamento.movimentoCaixaId ? validos.get(String(pagamento.movimentoCaixaId)) : undefined;
    if (pagamento.movimentoCaixaId && (!movimento || String(movimento.origemId) !== String(pagamento._id)
      || dinheiroParaCentavos(movimento.valor) !== dinheiroParaCentavos(pagamento.valor))) return false;
    const valor = dinheiroParaCentavos(pagamento.valor);
    return Number.isFinite(valor) && valor > 0;
  });
}

export async function totaisPagamentosValidosPorVenda(db: Connection, vendaIds: string[], empresaId: string) {
  const pagamentos = await listarPagamentosValidosDasVendas(db, vendaIds, empresaId);
  const totais = new Map<string, number>();
  for (const pagamento of pagamentos) {
    const vendaId = String(pagamento.vendaId);
    totais.set(vendaId, (totais.get(vendaId) ?? 0) + dinheiroParaCentavos(pagamento.valor));
  }
  return totais;
}

export async function totalPagamentosValidosCentavos(db: Connection, vendaId: string, empresaId: string, ignoredPagamentoId?: string) {
  const pagamentos = await listarPagamentosValidos(db, vendaId, empresaId, ignoredPagamentoId);
  return pagamentos.reduce((total, pagamento) => total + dinheiroParaCentavos(pagamento.valor), 0);
}
