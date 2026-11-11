import { Types, type ClientSession, type Connection } from 'mongoose';

export type TipoProtocoloOperacional = 'REC' | 'ORC' | 'OS' | 'VEN';

/**
 * Allocates a human-readable, tenant-scoped protocol. Gaps are intentional:
 * counters are reserved server-side and never reused after a committed record.
 */
export async function gerarProtocoloOperacional(
  db: Connection,
  empresaId: string,
  tipo: TipoProtocoloOperacional,
  data = new Date(),
  session?: ClientSession,
): Promise<string> {
  const ano = data.getUTCFullYear();
  const empresaNormalizada = new Types.ObjectId(empresaId).toHexString();
  const chave = `${empresaNormalizada}:${tipo}:${ano}`;
  const transacoes = db.base as unknown as {
    transactionAsyncLocalStorage?: { getStore: () => { session?: ClientSession } | undefined };
  };
  const sessaoAtiva = session ?? transacoes.transactionAsyncLocalStorage?.getStore()?.session;
  const sequencias = db.collection<{ _id: string; empresaId: string; tipo: TipoProtocoloOperacional; ano: number; valor: number }>('sequenciasOperacionais');
  const sequencia = await sequencias.findOneAndUpdate(
    { _id: chave },
    { $setOnInsert: { empresaId: empresaNormalizada, tipo, ano }, $inc: { valor: 1 } },
    { upsert: true, returnDocument: 'after', ...(sessaoAtiva ? { session: sessaoAtiva } : {}) },
  );

  if (!sequencia || !Number.isSafeInteger(sequencia.valor) || sequencia.valor < 1) {
    throw new Error('Não foi possível reservar o próximo protocolo operacional.');
  }
  return `${tipo}-${ano}-${String(sequencia.valor).padStart(6, '0')}`;
}
