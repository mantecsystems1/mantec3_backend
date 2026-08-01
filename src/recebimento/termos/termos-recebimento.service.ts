import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { TermosRecebimento, TermosRecebimentoDocument } from './termos-recebimento.schema';
import { CreateTermosRecebimentoDto } from './dto/create-termos-recebimento.dto';
import { UpdateTermosRecebimentoDto } from './dto/update-termos-recebimento.dto';

@Injectable()
export class TermosRecebimentoService {
  constructor(
    @InjectModel(TermosRecebimento.name) private termosRecebimentoModel: Model<TermosRecebimentoDocument>,
  ) {}

  create(createTermosRecebimentoDto: CreateTermosRecebimentoDto) {
    const createdTermosRecebimento = new this.termosRecebimentoModel(
      this.montarDadosTermo(createTermosRecebimentoDto),
    );
    return createdTermosRecebimento.save();
  }

  findAll() {
    return this.termosRecebimentoModel.find().exec();
  }

  findOne(id: string) {
    return this.termosRecebimentoModel.findById(id).exec();
  }

  update(id: string, updateTermosRecebimentoDto: UpdateTermosRecebimentoDto) {
    return this.termosRecebimentoModel.findByIdAndUpdate(id, this.montarDadosTermo(updateTermosRecebimentoDto), { new: true }).exec();
  }

  remove(id: string) {
    return this.termosRecebimentoModel.findByIdAndDelete(id).exec();
  }

  private montarDadosTermo(dto: CreateTermosRecebimentoDto | UpdateTermosRecebimentoDto) {
    const data: Record<string, unknown> = { ...dto };
    if (typeof dto.texto === 'string') {
      data.termoHashSha256 = this.hashString(dto.texto);
    }

    if (typeof dto.assinaturaImagemBase64 === 'string' && dto.assinaturaImagemBase64.trim()) {
      data.assinaturaHashSha256 = this.hashString(dto.assinaturaImagemBase64);
    }

    if (dto.assinado && !dto.dataAssinatura) {
      data.dataAssinatura = new Date();
    }

    if (dto.dataAssinatura) {
      data.dataAssinatura = new Date(dto.dataAssinatura);
    }

    return data;
  }

  private hashString(value: string) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
