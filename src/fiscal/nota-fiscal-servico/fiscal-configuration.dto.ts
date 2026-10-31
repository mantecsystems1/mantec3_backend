import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Min } from 'class-validator';

export class BindFiscalEmitterDto {
  @IsUUID('4') emitterId: string;
}
export class UploadFiscalCertificateDto {
  @IsInt() @Min(0) expectedRevision: number;
  @IsString() @Length(100, 32768) @Matches(/^[A-Za-z0-9+/]+={0,2}$/) pfxBase64: string;
  @IsString() @Length(0, 256) @Matches(/^[^\0\r\n]*$/) password: string;
  @IsString() @Length(5, 200) @Matches(/\S/) reason: string;
}
export class RegisterFiscalEmitterDto {
  @Matches(/^\d{14}$/) cnpj: string;
  @IsString() @Length(2, 160) @Matches(/\S/) legalName: string;
  @IsString() @Length(2, 100) @Matches(/\S/) city: string;
  @IsIn(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) state: string;
}
export class FiscalProfileDto {
  @IsInt() @Min(0) expectedRevision: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) validFrom: string;
  @IsIn(['mei', 'simples_nacional', 'lucro_presumido', 'lucro_real']) regime: string;
  @Matches(/^\d{7}$/) municipalityCode: string;
  @IsOptional() @IsString() @Length(1, 40) @Matches(/^[a-zA-Z0-9./-]+$/) municipalRegistration?: string;
  @IsString() @Length(5, 200) @Matches(/\S/) reason: string;
}
