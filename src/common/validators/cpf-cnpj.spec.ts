import { isValidCpfCnpj } from './cpf-cnpj';
describe('CPF e CNPJ', () => {
  it.each(['529.982.247-25', '52998224725', '11.222.333/0001-81'])('aceita digitos verificadores validos: %s', value => expect(isValidCpfCnpj(value)).toBe(true));
  it.each(['111.111.111-11', '00000000000000', '52998224726', '11222333000182', 'abc52998224725', '', null])('rejeita documento invalido: %s', value => expect(isValidCpfCnpj(value)).toBe(false));
});
