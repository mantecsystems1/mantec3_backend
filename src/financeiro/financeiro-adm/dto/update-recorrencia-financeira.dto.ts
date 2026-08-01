import { PartialType } from '@nestjs/mapped-types';
import { CreateRecorrenciaFinanceiraDto } from './create-recorrencia-financeira.dto';

export class UpdateRecorrenciaFinanceiraDto extends PartialType(CreateRecorrenciaFinanceiraDto) {}
