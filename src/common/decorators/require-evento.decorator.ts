import { SetMetadata } from '@nestjs/common';
import { EventoNegocio } from '../../permissoes/matriz-permissoes';

export const REQUIRED_EVENTO_KEY = 'requiredEventoNegocio';
export const REQUIRED_EVENTO_FROM_BODY_KEY = 'requiredEventoNegocioFromBody';

export interface RequiredEventoFromBodyConfig {
  field: string;
  map: Partial<Record<string, EventoNegocio>>;
  fallback: EventoNegocio;
}

export const RequireEvento = (evento: EventoNegocio) => SetMetadata(REQUIRED_EVENTO_KEY, evento);

export const RequireEventoFromBody = (
  field: string,
  map: Partial<Record<string, EventoNegocio>>,
  fallback: EventoNegocio,
) => SetMetadata(REQUIRED_EVENTO_FROM_BODY_KEY, { field, map, fallback } satisfies RequiredEventoFromBodyConfig);
