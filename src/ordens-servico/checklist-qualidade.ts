import { normalizarCategoriaEquipamento } from '../common/equipamento-categorias';

export const CHECKLIST_QUALIDADE_BASE = [
  'ligar_desligar', 'tela_toque', 'botoes', 'cameras', 'audio_microfone', 'conexoes', 'carregamento',
] as const;

export const CHECKLIST_QUALIDADE_EXTRA = {
  celular: ['sim_rede_movel'],
  tablet: ['rotacao_sensores', 'caneta_acessorios'],
  notebook: ['teclado', 'touchpad', 'bateria', 'portas'],
  desktop: ['portas_usb_video', 'rede_cabeada', 'ventilacao'],
  outro: [],
} as const;

export const CHECKLIST_QUALIDADE_TODOS = [
  ...CHECKLIST_QUALIDADE_BASE,
  ...CHECKLIST_QUALIDADE_EXTRA.celular,
  ...CHECKLIST_QUALIDADE_EXTRA.tablet,
  ...CHECKLIST_QUALIDADE_EXTRA.notebook,
  ...CHECKLIST_QUALIDADE_EXTRA.desktop,
] as const;

export const CHECKLIST_QUALIDADE_ROTULOS: Record<(typeof CHECKLIST_QUALIDADE_TODOS)[number], string> = {
  ligar_desligar: 'Liga e desliga',
  tela_toque: 'Tela e toque',
  botoes: 'Botões',
  cameras: 'Câmeras',
  audio_microfone: 'Áudio e microfone',
  conexoes: 'Conexões',
  carregamento: 'Carregamento',
  sim_rede_movel: 'SIM e rede móvel',
  rotacao_sensores: 'Rotação e sensores',
  caneta_acessorios: 'Caneta e acessórios',
  teclado: 'Teclado',
  touchpad: 'Touchpad',
  bateria: 'Bateria',
  portas: 'Portas e periféricos',
  portas_usb_video: 'Portas USB e vídeo',
  rede_cabeada: 'Rede cabeada',
  ventilacao: 'Ventilação e ruído',
};

export function codigosChecklistQualidade(categoria?: string | null, tipoEquipamento?: string | null) {
  const categoriaNormalizada = normalizarCategoriaEquipamento(categoria, tipoEquipamento);
  return [...CHECKLIST_QUALIDADE_BASE, ...CHECKLIST_QUALIDADE_EXTRA[categoriaNormalizada]];
}
