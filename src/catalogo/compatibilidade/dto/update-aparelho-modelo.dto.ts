import { PartialType } from '@nestjs/mapped-types';
import { CreateAparelhoModeloDto } from './create-aparelho-modelo.dto';

export class UpdateAparelhoModeloDto extends PartialType(CreateAparelhoModeloDto) {}

