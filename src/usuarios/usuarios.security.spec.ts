import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { EmpresaController } from '../core/empresa/empresa.controller';

const actor = { id: 'ator', _id: 'ator', sub: 'ator', empresaId: '507f1f77bcf86cd799439011', perfil: 'admin_empresa' } as CurrentUserPayload;
describe('Isolamento de usuarios e empresas', () => {
  const result = { populate: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) };
  const model = { find: jest.fn(() => result), findOne: jest.fn(() => result), findOneAndUpdate: jest.fn(() => result), findOneAndDelete: jest.fn(() => result) };
  const service = new UsuariosService(model as never);
  beforeEach(() => jest.clearAllMocks());
  it('limita lista e busca ao tenant autenticado', async () => {
    await service.findAll(actor);
    await service.findOne('outro-usuario', actor);
    expect(model.find).toHaveBeenCalledWith({ empresaId: actor.empresaId, perfil: { $not: /^\s*(?:admin|administrador)\s*$/i } });
    expect(model.findOne).toHaveBeenCalledWith({ _id: 'outro-usuario', empresaId: actor.empresaId, perfil: { $not: /^\s*(?:admin|administrador)\s*$/i } });
    expect(() => service.findAll()).toThrow(UnauthorizedException);
  });
  it.each(['administrador', 'admin', ' ADMIN '])('rejeita escalacao pelo perfil %s', async perfil => {
    await expect(service.update('usuario', { perfil }, actor)).rejects.toThrow(ForbiddenException);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejeita transferencia para outra empresa', async () => {
    await expect(service.update('usuario', { empresaId: 'outra' }, actor)).rejects.toThrow(ForbiddenException);
  });
  it('impede usuario bloquear ou excluir a propria conta', async () => {
    await expect(service.update('ator', { ativo: false }, actor)).rejects.toThrow(ForbiddenException);
    await expect(() => service.remove('ator', actor)).toThrow(ForbiddenException);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(model.findOneAndDelete).not.toHaveBeenCalled();
  });
  it('nao altera nem exclui administradores da plataforma e revoga sessoes ao editar', async () => {
    await service.update('usuario', { ativo: false }, actor);
    await service.remove('usuario', actor);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'usuario', empresaId: actor.empresaId, perfil: { $not: /^\s*(?:admin|administrador)\s*$/i } },
      { $set: { ativo: false }, $inc: { tokenVersion: 1 } }, { new: true, runValidators: true },
    );
    expect(model.findOneAndDelete).toHaveBeenCalledWith(expect.objectContaining({ empresaId: actor.empresaId }));
  });
  it('impede consulta e gestao de outra empresa', () => {
    const empresas = { findAll: jest.fn() };
    const controller = new EmpresaController(empresas as never);
    controller.findAll(actor);
    expect(empresas.findAll).toHaveBeenCalledWith(actor.empresaId);
    expect(() => controller.findOne('outra', actor)).toThrow(ForbiddenException);
    expect(() => controller.update(actor.empresaId, {}, actor)).toThrow(ForbiddenException);
  });
});
