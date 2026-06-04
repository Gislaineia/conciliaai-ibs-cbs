/**
 * Motor de regras IPI — classifica CST IPI, alíquota TIPI, crédito/débito.
 */
import type { Empresa, Documento, ItemDocumento } from "@/types";
import { CSTS_IPI, buscarAliquotaIPI } from "./tabelas-fiscais";

export interface ResultadoIpi {
  cst_ipi: string;
  aliquota_ipi: number;
  base_calculo_ipi: number;
  valor_ipi: number;
  gera_credito: boolean;
  gera_debito: boolean;
  observacao?: string;
}

export function classificarIPI(
  empresa: Empresa,
  documento: Pick<Documento, "direcao">,
  item: Pick<ItemDocumento, "ncm" | "valor_total" | "cst_ipi" | "valor_ipi">
): ResultadoIpi {
  // Empresa não contribuinte de IPI? (comércio sem industrialização)
  const contribuinte = empresa.contribuinte_ipi !== false &&
    (empresa.tipo_estabelecimento === "INDUSTRIAL" || empresa.tipo_estabelecimento === "EQUIPARADO");

  if (!contribuinte) {
    return {
      cst_ipi: documento.direcao === "ENTRADA" ? "49" : "99",
      aliquota_ipi: 0,
      base_calculo_ipi: 0,
      valor_ipi: 0,
      gera_credito: false,
      gera_debito: false,
      observacao: "Empresa não contribuinte de IPI (comercial)",
    };
  }

  // Alíquota TIPI por NCM
  const aliqTipi = buscarAliquotaIPI(item.ncm);
  let cst: string;

  if (aliqTipi === -1) {
    // NT — Não tributado
    cst = documento.direcao === "ENTRADA" ? "03" : "53";
    return {
      cst_ipi: cst,
      aliquota_ipi: 0,
      base_calculo_ipi: 0,
      valor_ipi: 0,
      gera_credito: false,
      gera_debito: false,
      observacao: "NCM Não Tributado pela TIPI",
    };
  }

  if (aliqTipi === 0) {
    cst = documento.direcao === "ENTRADA" ? "01" : "51";
    return {
      cst_ipi: cst,
      aliquota_ipi: 0,
      base_calculo_ipi: item.valor_total,
      valor_ipi: 0,
      gera_credito: false,
      gera_debito: false,
      observacao: "Alíquota zero",
    };
  }

  // Tributado
  cst = documento.direcao === "ENTRADA" ? "00" : "50";
  const baseCalculo = item.valor_total;
  const valorIpi = round2(baseCalculo * (aliqTipi / 100));

  return {
    cst_ipi: cst,
    aliquota_ipi: aliqTipi,
    base_calculo_ipi: baseCalculo,
    valor_ipi: valorIpi,
    gera_credito: documento.direcao === "ENTRADA",
    gera_debito: documento.direcao === "SAIDA",
    observacao: undefined,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function listarCSTsIpiAplicaveis(direcao: "ENTRADA" | "SAIDA") {
  return CSTS_IPI.filter((c) => (direcao === "ENTRADA" ? c.tipo === "entrada" : c.tipo === "saida"));
}
