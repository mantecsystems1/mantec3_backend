import { PartialType } from '@nestjs/mapped-types';
import { CreateCompatibilidadeModeloDto } from './create-compatibilidade-modelo.dto';

export class UpdateCompatibilidadeModeloDto extends PartialType(CreateCompatibilidadeModeloDto) {}

