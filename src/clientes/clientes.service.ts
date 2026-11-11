import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cliente, ClienteDocument } from './schemas/cliente.schema';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDITORIA_ENTIDADES, AUDITORIA_EVENTOS } from '../auditoria/auditoria-eventos';
import { buscaLiteralRegex, lerConsultaListaOperacional, respostaListaOperacional } from '../common/paginacao-operacional';

type ClienteAuditavelEvento =
  | typeof AUDITORIA_EVENTOS.CLIENTE_CRIADO
  | typeof AUDITORIA_EVENTOS.CLIENTE_ATUALIZADO
  | typeof AUDITORIA_EVENTOS.CLIENTE_REMOVIDO
  | typeof AUDITORIA_EVENTOS.CLIENTE_DESATIVADO;

const DOCUMENTO_EM_USO =
  'Este CPF/CNPJ já está cadastrado nesta empresa. Consulte o cadastro existente antes de criar outro cliente.';

/** CPF/CNPJ informado (sem espaços) ou undefined quando vazio: o documento é opcional. */
const documentoInformado = (valor: unknown) => {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || undefined;
};

/** Converte a violação do índice único do documento em 409 com mensagem para o operador. */
const traduzirDocumentoDuplicado = (error: unknown) =>
  (error as { code?: number })?.code === 11000 ? new ConflictException(DOCUMENTO_EM_USO) : error;

@Injectable()
export class ClientesService {
  constructor(
    @InjectModel(Cliente.name) private clienteModel: Model<ClienteDocument>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createClienteDto: CreateClienteDto, actorId?: string, actorEmpresaId?: string) {
    const empresaId = this.getEmpresaIdPermitida(createClienteDto.empresaId, actorEmpresaId);
    if (!Types.ObjectId.isValid(empresaId)) {
      throw new BadRequestException('Empresa invalida para o cadastro do cliente');
    }

    const cpfCnpj = documentoInformado(createClienteDto.cpfCnpj);
    if (cpfCnpj) {
      const duplicidade = await this.verificarPossiveisDuplicados({ cpfCnpj }, empresaId);
      if (duplicidade.documentoEmUso) throw new ConflictException(DOCUMENTO_EM_USO);
    }

    const createdCliente = new this.clienteModel({
      nome: createClienteDto.nome,
      telefone: createClienteDto.telefone,
      email: createClienteDto.email,
      endereco: createClienteDto.endereco,
      ...(typeof createClienteDto.ativo === 'boolean' ? { ativo: createClienteDto.ativo } : {}),
      ...(cpfCnpj ? { cpfCnpj } : {}),
      empresaId,
    });
    let saved: ClienteDocument;
    try {
      saved = await createdCliente.save();
    } catch (error) {
      throw traduzirDocumentoDuplicado(error);
    }

    if (actorId) {
      await this.registrarAuditoriaCliente(saved, actorId, AUDITORIA_EVENTOS.CLIENTE_CRIADO, {
        nome: createClienteDto.nome,
        cpfCnpj,
        email: createClienteDto.email,
        telefone: createClienteDto.telefone,
      });
    }

    return saved;
  }

  async verificarPossiveisDuplicados(
    consulta: { cpfCnpj?: unknown; nome?: unknown; telefone?: unknown },
    empresaId?: string,
  ) {
    this.assertEmpresaInformada(empresaId);
    const documento = String(consulta.cpfCnpj ?? '').replace(/\D/g, '');
    // Sem documento a conferência continua por nome e telefone (o CPF/CNPJ é opcional).
    if (documento && ![11, 14].includes(documento.length)) throw new BadRequestException('Informe um CPF ou CNPJ válido para conferir possíveis cadastros repetidos.');
    const documentoRegex = documento ? new RegExp(`^${documento.split('').join('[^0-9]*')}$`) : undefined;
    const nome = String(consulta.nome ?? '').trim().slice(0, 120);
    const telefone = String(consulta.telefone ?? '').replace(/\D/g, '').slice(0, 14);
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const telefoneRegex = telefone.length >= 10 ? new RegExp(`^${telefone.split('').join('[^0-9]*')}$`) : undefined;
    const [documentoEmUso, nomeCorrespondencias, telefoneCorrespondencias] = await Promise.all([
      documentoRegex ? this.clienteModel.exists({ empresaId, cpfCnpj: documentoRegex }).exec() : Promise.resolve(null),
      nome.length >= 3 ? this.clienteModel.countDocuments({ empresaId, nome: new RegExp(`^${escapeRegex(nome)}$`, 'i') }).exec() : Promise.resolve(0),
      telefoneRegex ? this.clienteModel.countDocuments({ empresaId, telefone: telefoneRegex }).exec() : Promise.resolve(0),
    ]);
    return {
      documentoEmUso: Boolean(documentoEmUso),
      nomeCorrespondencias,
      telefoneCorrespondencias,
    };
  }

  findAll(empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.clienteModel.find(this.getEmpresaQuery(empresaId)).exec();
  }

  /** Lista paginada no servidor: busca por nome, e-mail, telefone ou documento; filtro ativo/inativo. */
  async findAllPaginado(empresaId: string | undefined, query: Record<string, unknown>) {
    this.assertEmpresaInformada(empresaId);
    const consulta = lerConsultaListaOperacional(query);
    const filtro: Record<string, unknown> = {};
    if (consulta.status === 'ativo') filtro.ativo = { $ne: false };
    else if (consulta.status === 'inativo') filtro.ativo = false;
    else if (consulta.status) throw new BadRequestException('O filtro de situação do cliente é inválido.');
    if (consulta.busca) {
      const texto = buscaLiteralRegex(consulta.busca);
      const digitos = consulta.busca.replace(/\D/g, '');
      filtro.$or = [
        { nome: texto },
        { email: texto },
        { telefone: texto },
        { cpfCnpj: texto },
        ...(digitos.length >= 3 ? [{ telefone: buscaLiteralRegex(digitos) }, { cpfCnpj: buscaLiteralRegex(digitos) }] : []),
      ];
    }
    const condicao = this.getEmpresaQuery(empresaId, filtro);
    const [itens, total] = await Promise.all([
      this.clienteModel.find(condicao).sort({ nome: 1, _id: 1 })
        .skip((consulta.pagina - 1) * consulta.limite).limit(consulta.limite).exec(),
      this.clienteModel.countDocuments(condicao).exec(),
    ]);
    return respostaListaOperacional(itens, total, consulta);
  }

  findOne(id: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    return this.clienteModel.findOne(this.getEmpresaQuery(empresaId, { _id: id })).exec();
  }

  async update(id: string, updateClienteDto: UpdateClienteDto, actorId?: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    if (empresaId && updateClienteDto.empresaId && String(updateClienteDto.empresaId) !== String(empresaId)) {
      throw new BadRequestException('Cliente nao pode ser movido para outra empresa.');
    }

    // Só os campos editáveis, um a um e com o tipo esperado (nada do corpo vai direto para a consulta).
    // Documento apagado no formulário remove o campo (não grava texto vazio).
    const $set: Record<string, string | boolean | Record<string, string>> = {};
    for (const campo of ['nome', 'telefone', 'email'] as const) {
      const valor = updateClienteDto[campo];
      if (typeof valor === 'string') $set[campo] = valor;
    }
    if (typeof updateClienteDto.ativo === 'boolean') $set.ativo = updateClienteDto.ativo;
    if (updateClienteDto.endereco && typeof updateClienteDto.endereco === 'object') {
      const endereco: Record<string, string> = {};
      for (const campo of ['logradouro', 'numero', 'bairro', 'cidade', 'estado', 'cep'] as const) {
        const valor = updateClienteDto.endereco[campo];
        if (typeof valor === 'string') endereco[campo] = valor;
      }
      $set.endereco = endereco;
    }
    const documentoRecebido = updateClienteDto.cpfCnpj;
    const cpfCnpj = documentoInformado(documentoRecebido);
    if (cpfCnpj) $set.cpfCnpj = cpfCnpj;
    const alteracao: Record<string, unknown> = { $set };
    if (documentoRecebido !== undefined && !cpfCnpj) alteracao.$unset = { cpfCnpj: 1 };

    let updated: ClienteDocument | null;
    try {
      updated = await this.clienteModel
        .findOneAndUpdate(this.getEmpresaQuery(empresaId, { _id: id }), alteracao, { new: true })
        .exec();
    } catch (error) {
      throw traduzirDocumentoDuplicado(error);
    }

    if (actorId && updated) {
      await this.registrarAuditoriaCliente(updated, actorId, AUDITORIA_EVENTOS.CLIENTE_ATUALIZADO, {
        camposAlterados: Object.keys(updateClienteDto),
      });
    }

    return updated;
  }

  async remove(id: string, actorId?: string, empresaId?: string) {
    this.assertEmpresaInformada(empresaId);
    const removed = await this.clienteModel
      .findOneAndUpdate(this.getEmpresaQuery(empresaId, { _id: id }), { ativo: false }, { new: true })
      .exec();

    if (actorId && removed) {
      await this.registrarAuditoriaCliente(removed, actorId, AUDITORIA_EVENTOS.CLIENTE_DESATIVADO, {
        nome: removed.nome,
        cpfCnpj: removed.cpfCnpj,
        ativo: false,
      });
    }

    return removed;
  }

  private async registrarAuditoriaCliente(
    cliente: ClienteDocument,
    actorId: string,
    tipoEvento: ClienteAuditavelEvento,
    dados: Record<string, unknown>,
  ) {
    await this.auditoriaService.registrarEventoNegocio({
      empresaId: cliente.empresaId,
      usuarioId: actorId,
      tipoEvento,
      entidade: AUDITORIA_ENTIDADES.CLIENTE,
      entidadeId: cliente._id as Types.ObjectId,
      dados,
    });
  }

  private getEmpresaQuery(empresaId?: string, base: Record<string, unknown> = {}) {
    this.assertEmpresaInformada(empresaId);
    return { ...base, empresaId };
  }

  private getEmpresaIdPermitida(inputEmpresaId: unknown, userEmpresaId?: string) {
    if (userEmpresaId) {
      if (inputEmpresaId && String(inputEmpresaId) !== String(userEmpresaId)) {
        throw new UnauthorizedException('Empresa informada nao pertence ao usuario.');
      }
      return userEmpresaId;
    }

    if (!inputEmpresaId) {
      throw new UnauthorizedException('Empresa do cliente nao informada.');
    }

    return String(inputEmpresaId);
  }

  private assertEmpresaInformada(empresaId?: string) {
    if (!empresaId) {
      throw new UnauthorizedException('Empresa do usuario nao informada.');
    }
  }
}
