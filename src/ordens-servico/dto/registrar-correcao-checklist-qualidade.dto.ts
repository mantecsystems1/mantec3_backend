import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { RegistrarChecklistQualidadeOsDto } from './registrar-checklist-qualidade.dto';

export class RegistrarCorrecaoChecklistQualidadeDto extends RegistrarChecklistQualidadeOsDto {
  @IsInt()
  @Min(0)
  revisaoEsperada!: number;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  motivo!: string;
}
