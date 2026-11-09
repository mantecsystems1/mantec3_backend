import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsObject, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CATEGORIAS_EQUIPAMENTO } from '../../common/equipamento-categorias';

const Optional = () => ValidateIf((_object, value: unknown) => value !== undefined);

export class FormRascunhoRecebimentoDto {
  @Optional() @IsString() @Matches(/^$|^[a-f\d]{24}$/i) clienteId?: string;
  @Optional() @IsString() @MaxLength(80) tipoEquipamento?: string;
  @Optional() @IsIn(['', ...CATEGORIAS_EQUIPAMENTO]) categoriaEquipamento?: string;
  @Optional() @IsString() @MaxLength(80) marca?: string;
  @Optional() @IsString() @MaxLength(120) modelo?: string;
  @Optional() @IsString() @MaxLength(100) imeiOuSerial?: string;
  @Optional() @IsString() @Matches(/^$|^\d{4}-\d{2}-\d{2}$/) dataRecebimento?: string;
  @Optional() @IsString() @MaxLength(4000) observacoesGerais?: string;
  @Optional() @IsIn(['', 'recebido', 'em_triagem', 'encaminhado']) status?: string;
  @Optional() @IsString() @MaxLength(8000) termoTexto?: string;
  @Optional() @IsIn(['', 'assinatura_tela', 'aceite_eletronico']) metodoAssinatura?: string;
  @Optional() @IsString() @MaxLength(160) signatarioNome?: string;
  @Optional() @IsString() @MaxLength(40) signatarioDocumento?: string;
  @Optional() @IsString() @MaxLength(2000) observacoesAssinatura?: string;
}

export class CondicaoRascunhoDto {
  @Optional() @IsString() @MaxLength(80) categoria?: string;
  @Optional() @IsString() @MaxLength(120) tipo?: string;
  @Optional() @IsIn(['', 'baixa', 'media', 'alta', 'critica']) severidade?: string;
  @Optional() @IsString() @MaxLength(2000) observacoes?: string;
}

export class ComponenteRascunhoDto {
  @Optional() @IsString() @MaxLength(160) nomeComponente?: string;
  @Optional() @IsString() @MaxLength(2000) observacoes?: string;
}

export class MidiaRascunhoDto {
  @Optional() @IsIn(['foto', 'video']) tipo?: string;
  @Optional() @IsString() @MaxLength(1000) urlArquivo?: string;
  @Optional() @IsString() @MaxLength(2000) descricao?: string;
  @Optional() @IsString() @MaxLength(255) nomeOriginal?: string;
  @Optional() @IsString() @MaxLength(100) mimeType?: string;
  @Optional() @IsInt() @Min(0) @Max(50 * 1024 * 1024) tamanhoBytes?: number;
  @Optional() @IsString() @MaxLength(80) origemCaptura?: string;
  @Optional() @IsString() @MaxLength(40) capturadoEm?: string;
}

export class DadosRascunhoRecebimentoDto {
  @Optional() @IsInt() @Min(0) @Max(4) etapa?: number;
  @Optional() @IsObject() @ValidateNested() @Type(() => FormRascunhoRecebimentoDto)
  form?: FormRascunhoRecebimentoDto;

  @Optional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CondicaoRascunhoDto)
  condicoes?: CondicaoRascunhoDto[];

  @Optional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ComponenteRascunhoDto)
  componentes?: ComponenteRascunhoDto[];

  @Optional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => MidiaRascunhoDto)
  midias?: MidiaRascunhoDto[];
}

export class SalvarRascunhoRecebimentoDto {
  @IsInt() @Min(0) revisaoEsperada: number;
  @IsObject() @ValidateNested() @Type(() => DadosRascunhoRecebimentoDto)
  dados: DadosRascunhoRecebimentoDto;
}
