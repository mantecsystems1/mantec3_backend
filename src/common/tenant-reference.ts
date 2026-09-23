import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Connection, Types } from 'mongoose';

/** Never resolve a tenant-owned reference by identifier alone. */
export async function assertTenantReference(db: Connection, model: string, id: unknown, empresaId: unknown) {
  if (!Types.ObjectId.isValid(String(id)) || !Types.ObjectId.isValid(String(empresaId))) {
    throw new BadRequestException('Referencia ou empresa invalida.');
  }
  const found = await db.model(model).exists({ _id: id, empresaId }).exec();
  if (!found) throw new NotFoundException('Referencia nao encontrada na empresa.');
}
