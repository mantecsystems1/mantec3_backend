import { BadRequestException } from '@nestjs/common';

export interface ConsultaListaOperacional {
  pagina: number;
  limite: number;
  busca?: string;
  status?: string;
  prioridade?: string;
  resultado?: 'sem_reparo' | 'devolvido_sem_reparo';
}

export function lerConsultaListaOperacional(query: Record<string, unknown>): ConsultaListaOperacional {
  const inteiro = (valor: unknown, padrao: number, nome: string, maximo: number) => {
    if (valor === undefined || valor === '') return padrao;
    const texto = String(valor);
    if (!/^\d+$/.test(texto)) throw new BadRequestException(`O campo ${nome} deve ser um número inteiro positivo.`);
    const numero = Number(texto);
    if (!Number.isSafeInteger(numero) || numero < 1 || numero > maximo) throw new BadRequestException(`O campo ${nome} está fora do limite permitido.`);
    return numero;
  };

  const busca = query.busca === undefined ? undefined : String(query.busca).trim();
  if (busca && busca.length > 100) throw new BadRequestException('A busca deve ter no máximo 100 caracteres.');
  const status = query.status === undefined || String(query.status).trim() === '' ? undefined : String(query.status).trim();
  if (status && !/^[a-z][a-z0-9_]{0,39}$/.test(status)) throw new BadRequestException('O filtro de situação é inválido.');
  const prioridade = query.prioridade === undefined || String(query.prioridade).trim() === '' ? undefined : String(query.prioridade).trim();
  if (prioridade && !/^[a-z][a-z0-9_]{0,39}$/.test(prioridade)) throw new BadRequestException('O filtro de prioridade é inválido.');
  const resultado = query.resultado === undefined || String(query.resultado).trim() === '' ? undefined : String(query.resultado).trim();
  if (resultado && !['sem_reparo', 'devolvido_sem_reparo'].includes(resultado)) throw new BadRequestException('O filtro de resultado é inválido.');

  return {
    pagina: inteiro(query.pagina, 1, 'pagina', 100_000),
    limite: inteiro(query.limite, 25, 'limite', 100),
    ...(busca ? { busca } : {}),
    ...(status ? { status } : {}),
    ...(prioridade ? { prioridade } : {}),
    ...(resultado ? { resultado: resultado as 'sem_reparo' | 'devolvido_sem_reparo' } : {}),
  };
}

export function buscaLiteralRegex(busca: string): RegExp {
  return new RegExp(busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export function respostaListaOperacional<T>(itens: T[], total: number, consulta: ConsultaListaOperacional) {
  return {
    itens,
    pagina: consulta.pagina,
    limite: consulta.limite,
    total,
    totalPaginas: Math.ceil(total / consulta.limite),
  };
}
