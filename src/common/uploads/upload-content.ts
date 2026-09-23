import { BadRequestException } from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { finishUpload, persistUpload, removeUploadTemporaryFile } from './upload-storage';

export async function validateUploadContent(file: { path: string; mimetype: string }) {
  try {
    const size = (await stat(file.path)).size;
    if (!size || size > 50 * 1024 * 1024) throw new Error('size');
    const { fileTypeFromFile } = await import('file-type');
    const type = await fileTypeFromFile(file.path);
    if (file.mimetype === 'text/csv') {
      const content = await readFile(file.path);
      if (type || content.includes(0)) throw new Error('binary');
      new TextDecoder('utf-8', { fatal: true }).decode(content);
    } else {
      const mime = type?.mime;
      const compatibleHeif = ['image/heic', 'image/heif'].includes(file.mimetype) && ['image/heic', 'image/heif'].includes(mime || '');
      if (!type || (mime !== file.mimetype && !compatibleHeif)) throw new Error('type');
    }
  } catch {
    throw new BadRequestException('Conteudo do arquivo invalido ou incompativel com o tipo informado.');
  }
}

/** Authorization is still performed by the owning service before it creates metadata. */
export async function acceptUpload<T>(area: string, file: { path: string; filename: string; mimetype: string }, save: () => Promise<T>): Promise<T> {
  try { await validateUploadContent(file); }
  catch (error) { await removeUploadTemporaryFile(file.path); throw error; }
  try {
    await persistUpload(area, file);
    return await save();
  } finally {
    // Retain remote objects if the database outcome is uncertain; reconcile orphans separately.
    await finishUpload(file).catch(() => undefined);
  }
}
