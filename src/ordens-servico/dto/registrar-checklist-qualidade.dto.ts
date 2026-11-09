import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CHECKLIST_QUALIDADE_TODOS } from '../checklist-qualidade';

export class ChecklistQualidadeOsItemDto {
  @IsIn(CHECKLIST_QUALIDADE_TODOS)
  codigo!: (typeof CHECKLIST_QUALIDADE_TODOS)[number];

  @IsIn(['aprovado', 'falha', 'nao_aplicavel'])
  resultado!: 'aprovado' | 'falha' | 'nao_aplicavel';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class RegistrarChecklistQualidadeOsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CHECKLIST_QUALIDADE_TODOS.length)
  @ValidateNested({ each: true })
  @Type(() => ChecklistQualidadeOsItemDto)
  itens!: ChecklistQualidadeOsItemDto[];
}
