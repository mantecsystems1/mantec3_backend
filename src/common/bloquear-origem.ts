import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Connection, Types } from 'mongoose';

/** Must run inside Connection.transaction(): all writers of a derived record lock its origin first. */
export async function bloquearOrigem(db: Connection, model: 'Orcamento' | 'OrdemServico' | 'RecebimentoEquipamento', id: unknown, empresaId: unknown) {
  if (!Types.ObjectId.isValid(String(id)) || !Types.ObjectId.isValid(String(empresaId))) throw new BadRequestException('Referencia ou empresa invalida.');
  const origem = await db.model(model).findOneAndUpdate({ _id: id, empresaId }, { $inc: { __v: 1 } }, { new: true }).lean().exec();
  if (!origem) throw new NotFoundException('Referencia nao encontrada na empresa.');
  return origem as {
    clienteId?: unknown;
    recebimentoEquipamentoId?: unknown;
    status?: unknown;
    resultadoAtendimento?: unknown;
    categoriaEquipamento?: string;
    tipoEquipamento?: string;
  };
}
