import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDefined, IsEnum, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { OmitType } from '@nestjs/swagger';
import { CreateRecebimentoEquipamentoDto } from './create-recebimento-equipamento.dto';
import { CreateCondicoesEquipamentoDto } from '../../condicoes/dto/create-condicoes-equipamento.dto';
import { CreateComponentesAusentesDto } from '../../componentes-ausentes/dto/create-componentes-ausentes.dto';
import { CreateTermosRecebimentoDto } from '../../termos/dto/create-termos-recebimento.dto';
import { CreateMidiasRecebimentoDto } from '../../midias/dto/create-midias-recebimento.dto';

class CondicaoEntradaDto extends OmitType(CreateCondicoesEquipamentoDto, ['recebimentoEquipamentoId'] as const) {}
class ComponenteEntradaDto extends OmitType(CreateComponentesAusentesDto, ['recebimentoEquipamentoId'] as const) {}
class TermoEntradaDto extends OmitType(CreateTermosRecebimentoDto, ['recebimentoEquipamentoId'] as const) {}
class MidiaLinkEntradaDto extends OmitType(CreateMidiasRecebimentoDto, ['recebimentoEquipamentoId', 'chaveCliente'] as const) {}

export class MidiaEsperadaDto {
  @IsUUID()
  chaveCliente: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nomeOriginal: string;

  @Matches(/^[a-f0-9]{64}$/)
  hashSha256: string;

  @IsEnum(['foto', 'video'])
  tipo: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  origemCaptura?: string;

  @IsOptional()
  @IsISO8601()
  capturadoEm?: string;
}

export class CreateRecebimentoCompletoDto {
  @IsUUID()
  operacaoId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  rascunhoRevisao?: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => CreateRecebimentoEquipamentoDto)
  recebimento: CreateRecebimentoEquipamentoDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CondicaoEntradaDto)
  condicoes?: CondicaoEntradaDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ComponenteEntradaDto)
  componentesAusentes?: ComponenteEntradaDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TermoEntradaDto)
  termo?: TermoEntradaDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MidiaEsperadaDto)
  midiasEsperadas?: MidiaEsperadaDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MidiaLinkEntradaDto)
  midiasLinks?: MidiaLinkEntradaDto[];
}
