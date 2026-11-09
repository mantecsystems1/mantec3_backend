export const CATEGORIAS_EQUIPAMENTO = ['celular', 'tablet', 'notebook', 'desktop', 'outro'] as const;
export type CategoriaEquipamento = (typeof CATEGORIAS_EQUIPAMENTO)[number];

export function normalizarCategoriaEquipamento(categoria?: string | null, tipoEquipamento?: string | null): CategoriaEquipamento {
  const valorCategoria = String(categoria || '').trim().toLocaleLowerCase('pt-BR');
  if ((CATEGORIAS_EQUIPAMENTO as readonly string[]).includes(valorCategoria)) return valorCategoria as CategoriaEquipamento;
  const texto = String(tipoEquipamento || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  if (/\b(celular|smartphone|iphone|android|telefone movel|mobile)\b/.test(texto)) return 'celular';
  if (/\b(tablet|ipad)\b/.test(texto)) return 'tablet';
  if (/\b(notebook|laptop|macbook|chromebook)\b/.test(texto)) return 'notebook';
  if (/\b(desktop|computador|pc|gabinete)\b/.test(texto)) return 'desktop';
  return 'outro';
}
