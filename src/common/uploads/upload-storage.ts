import { BadRequestException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream, readFileSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

const areas = new Set(['produtos', 'recebimentos', 'financeiro-provas']);
let configured: { client: S3Client; bucket: string } | undefined;

export function uploadKey(area: string, filename: string) {
  if (!areas.has(area) || !filename || filename === '.' || filename === '..' || basename(filename) !== filename || /[\\/\x00]/.test(filename)) {
    throw new BadRequestException('Caminho de arquivo invalido.');
  }
  return `${area}/${filename}`;
}

function remoteStorage() {
  const driver = process.env.UPLOAD_STORAGE || 'local';
  if (driver === 'local') return undefined;
  if (driver !== 's3') throw new Error('UPLOAD_STORAGE invalido.');
  if (!configured) {
    const path = process.env.UPLOAD_S3_CONFIG_FILE;
    if (!path) throw new Error('Configuracao privada do armazenamento ausente.');
    const config = JSON.parse(readFileSync(path, 'utf8'));
    if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) throw new Error('Configuracao incompleta do armazenamento.');
    configured = { bucket: config.bucket, client: new S3Client({
      endpoint: config.endpoint, region: config.region || 'us-east-1', forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 3,
    }) };
  }
  return configured;
}

export async function persistUpload(area: string, file: { filename: string; path: string; mimetype: string }) {
  const key = uploadKey(area, file.filename);
  const remote = remoteStorage();
  if (!remote) return;
  const content = await readFile(file.path);
  await remote.client.send(new PutObjectCommand({ Bucket: remote.bucket, Key: key, Body: content,
    ContentType: file.mimetype, ChecksumSHA256: createHash('sha256').update(content).digest('base64'),
  }));
}

export async function openUpload(area: string, filename: string): Promise<Readable> {
  const key = uploadKey(area, filename);
  const remote = remoteStorage();
  if (remote) {
    const result = await remote.client.send(new GetObjectCommand({ Bucket: remote.bucket, Key: key }));
    if (!(result.Body instanceof Readable)) throw new Error('Resposta de armazenamento invalida.');
    return result.Body;
  }
  const path = resolve(process.cwd(), 'uploads', area, filename);
  const root = resolve(process.cwd(), 'uploads') + sep;
  if (!path.startsWith(root)) throw new BadRequestException('Caminho invalido.');
  // Open before returning so missing files can be translated into HTTP 404.
  const stream = createReadStream(path);
  await new Promise<void>((ok, fail) => { stream.once('open', () => ok()); stream.once('error', fail); });
  return stream;
}

export async function readUploadUrl(url: string): Promise<Buffer | null> {
  const match = /^\/uploads\/([^/]+)\/([^/]+)$/.exec(url || '');
  if (!match) return null;
  try {
    const stream = await openUpload(match[1], match[2]);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  } catch (error) {
    if (isMissingUpload(error)) return null;
    throw error;
  }
}

export function isMissingUpload(error: unknown) {
  const e = error as { code?: string; name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.code === 'ENOENT' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

export async function removeUploadTemporaryFile(path: string) {
  await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
}

export async function finishUpload(file: { path: string }) {
  if (process.env.UPLOAD_STORAGE === 's3') await removeUploadTemporaryFile(file.path);
}
