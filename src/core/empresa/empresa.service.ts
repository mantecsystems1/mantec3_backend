import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Empresa, EmpresaDocument } from './schemas/empresa.schema';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../../auditoria/auditoria-eventos';

@Injectable()
export class EmpresaService {
  constructor(
    @InjectModel(Empresa.name)
    private empresaModel: Model<EmpresaDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  create(data: CreateEmpresaDto) {
    return this.empresaModel.create(data);
  }

  findAll() {
    return this.empresaModel.find();
  }

  findOne(id: string) {
    return this.empresaModel.findById(id).exec();
  }

  update(id: string, data: UpdateEmpresaDto) {
    return this.empresaModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async remove(id: string, actorId?: string) {
    const empresa = await this.empresaModel.findByIdAndUpdate(id, { ativa: false }, { new: true }).exec();

    if (empresa && actorId) {
      await this.auditoriaService.registrarEventoNegocio({
        empresaId: empresa._id as Types.ObjectId,
        usuarioId: actorId,
        tipoEvento: AUDITORIA_EVENTOS.EMPRESA_DESATIVADA,
        entidade: AUDITORIA_ENTIDADES.EMPRESA,
        entidadeId: empresa._id as Types.ObjectId,
        dados: {
          nomeFantasia: empresa.nomeFantasia,
          cnpj: empresa.cnpj,
          ativa: false,
        },
      });
    }

    return empresa;
  }
}
