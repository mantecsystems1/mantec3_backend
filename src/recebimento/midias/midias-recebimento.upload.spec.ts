import { mkdtempSync, existsSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { MidiasRecebimentoController } from './midias-recebimento.controller';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

describe('Uploads de entrada verificam propriedade e replay antes de persistir', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'mantec-upload-qa-')); });
  afterEach(() => { rmSync(join(root, 'foto-qa.png'), { force: true }); rmdirSync(root); });
  const user = { empresaId: 'empresa-teste' } as CurrentUserPayload;
  const body = { recebimentoEquipamentoId: 'entrada-teste', tipo: 'foto', chaveCliente: 'chave-teste' };
  const file = () => {
    const path = join(root, 'foto-qa.png');
    writeFileSync(path, 'bytes descartaveis QA');
    return { path, filename: 'foto-qa.png', mimetype: 'image/png', originalname: 'foto.png', size: 22 };
  };
  it('repeticao retorna a mesma midia e remove apenas o novo temporario', async () => {
    const existing = { _id: 'midia-existente', urlArquivo: '/uploads/recebimentos/original.png' };
    const validarUpload = jest.fn().mockResolvedValue(existing);
    const create = jest.fn();
    const controller = new MidiasRecebimentoController({ validarUpload, create } as never);
    const input = file();
    expect(await controller.upload(input, body, user)).toEqual(existing);
    expect(validarUpload).toHaveBeenCalledWith(expect.objectContaining({ ...body, hashSha256: createHash('sha256').update('bytes descartaveis QA').digest('hex') }), user.empresaId);
    expect(create).not.toHaveBeenCalled();
    expect(existsSync(input.path)).toBe(false);
  });
  it('vinculo de outra empresa falha antes de armazenamento e nao deixa temporario', async () => {
    const validarUpload = jest.fn().mockRejectedValue(new NotFoundException('Entrada nao encontrada'));
    const create = jest.fn();
    const controller = new MidiasRecebimentoController({ validarUpload, create } as never);
    const input = file();
    await expect(controller.upload(input, body, user)).rejects.toThrow('Entrada nao encontrada');
    expect(existsSync(input.path)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
