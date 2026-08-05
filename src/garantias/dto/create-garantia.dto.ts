export class CreateGarantiaDto {
  empresaId: string;
  clienteId: string;
  vendaId?: string;
  ordemServicoId?: string;
  produtoId: string;
  quantidade: number;
  motivo: string;
  status: string;
  fornecedorId?: string;
}
