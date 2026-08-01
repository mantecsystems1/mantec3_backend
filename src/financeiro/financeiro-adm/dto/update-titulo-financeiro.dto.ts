import { PartialType } from '@nestjs/mapped-types';
import { CreateTituloFinanceiroDto } from './create-titulo-financeiro.dto';

export class UpdateTituloFinanceiroDto extends PartialType(CreateTituloFinanceiroDto) {}
