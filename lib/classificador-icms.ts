/**
 * Motor de regras ICMS — classifica CST, calcula alíquota, ST, DIFAL, reduções de BC.
 * Conforme Confaz / regulamentos estaduais.
 */
import type { Empresa, Documento, ItemDocumento } from "@/types";
import {
  CSTS_ICMS_NORMAL,
  CSOSN_SN,
  ALIQ_ICMS_INTERNA_UF,
  aliquotaIcmsInterestadual,
  buscarCEST,
  MVA_AMOSTRA,
} from "./tabelas-fiscais";

export interface ResultadoIcms {
  cst_icms: string;            // CST ou CSOSN
  aliquota_icms: number;       // %
  base_calculo_icms: number;
  valor_icms: number;
  // ST
  tem_st: boolean;
  cest?: string | null;
  mva?: number | null;
  base_calculo_st?: number;
  aliquota_icms_st?: number;
  valor_icms_st?: number;
  // DIFAL (B2C interestadual)
  tem_difal: boolean;
  aliquota_destino?: number;
  valor_difal?: number;
  // Outros
  reducao_base_pct?: number;
  observacao?: string;
}

export function classificarICMS(
  empresa: Empresa,
  documento: Pick<Documento, "direcao" | "uf_emitente" | "uf_destinatario" | "cfop_principal">,
  item: Pick<ItemDocumento, "ncm" | "cfop" | "valor_total" | "cst_icms" | "valor_icms" | "aliquota_icms">,
  destinatarioContribuinte = true
): ResultadoIcms {
  const ufOrigem = documento.uf_emitente ?? empresa.uf;
  const ufDestino = documento.uf_destinatario ?? empresa.uf;
  const cfop = item.cfop ?? documento.cfop_principal ?? "";

  // 1) CST por regime
  let cst: string;
  if (empresa.regime_tributario === "SIMPLES_NACIONAL" || empresa.regime_tributario === "MEI") {
    // CSOSN
    if (empresa.regime_tributario === "MEI") {
      cst = "400"; // Não tributada pelo Simples
    } else if (documento.direcao === "ENTRADA") {
      // Para empresas SN, ICMS recolhido pelo DAS (sem crédito)
      cst = "102"; // Tributada pelo Simples sem permissão de crédito
    } else {
      cst = empresa.simples_opta_destaque_ibs ? "101" : "102";
    }
  } else {
    // Regime normal — CST original
    cst = item.cst_icms ?? "00";
    if (cfop.startsWith("5405") || cfop.startsWith("6404")) cst = "10"; // ST
  }

  // 2) Alíquota
  let aliquota = item.aliquota_icms || 0;
  if (aliquota === 0) {
    if (ufOrigem === ufDestino) {
      aliquota = ALIQ_ICMS_INTERNA_UF[ufOrigem] ?? 18;
    } else {
      aliquota = aliquotaIcmsInterestadual(ufOrigem, ufDestino);
    }
  }

  // 3) Base de cálculo (com possível redução)
  let baseCalculo = item.valor_total;
  let reducao = 0;
  // Cesta básica, agro, etc — placeholder. Real: tabela de convênios por NCM/UF.
  if (cst === "20" || cst === "70") {
    reducao = 30;
    baseCalculo = item.valor_total * (1 - reducao / 100);
  }
  const valorIcms = round2(baseCalculo * (aliquota / 100));

  // 4) ICMS-ST
  let temST = false;
  let cest: string | null = null;
  let mva: number | null = null;
  let baseST = 0;
  let aliquotaST = aliquota;
  let valorST = 0;

  const cestEntry = buscarCEST(item.ncm);
  if (cestEntry || cst === "10" || cst === "70") {
    const mvaEntry = MVA_AMOSTRA.find((m) => (item.ncm ?? "").startsWith(m.ncm_prefix));
    if (mvaEntry) {
      temST = true;
      cest = cestEntry?.cest ?? null;
      mva = mvaEntry.mva_original;
      // MVA ajustada para interestadual
      if (ufOrigem !== ufDestino) {
        const aliq = aliquotaIcmsInterestadual(ufOrigem, ufDestino);
        if (aliq === 7 && mvaEntry.mva_ajustada_7) mva = mvaEntry.mva_ajustada_7;
        if (aliq === 12 && mvaEntry.mva_ajustada_12) mva = mvaEntry.mva_ajustada_12;
        if (aliq === 4 && mvaEntry.mva_ajustada_4) mva = mvaEntry.mva_ajustada_4;
      }
      baseST = round2(item.valor_total * (1 + mva / 100));
      aliquotaST = ALIQ_ICMS_INTERNA_UF[ufDestino] ?? 18;
      const valorICMSDestino = round2(baseST * (aliquotaST / 100));
      valorST = round2(valorICMSDestino - valorIcms);
      if (valorST < 0) valorST = 0;
    }
  }

  // 5) DIFAL (B2C interestadual conforme EC 87/2015)
  let temDifal = false;
  let aliqDestino: number | undefined;
  let valorDifal = 0;
  if (
    ufOrigem !== ufDestino &&
    !destinatarioContribuinte &&
    !temST &&
    documento.direcao === "SAIDA"
  ) {
    temDifal = true;
    aliqDestino = ALIQ_ICMS_INTERNA_UF[ufDestino] ?? 18;
    const aliqInter = aliquotaIcmsInterestadual(ufOrigem, ufDestino);
    valorDifal = round2(item.valor_total * ((aliqDestino - aliqInter) / 100));
    if (valorDifal < 0) valorDifal = 0;
  }

  return {
    cst_icms: cst,
    aliquota_icms: aliquota,
    base_calculo_icms: round2(baseCalculo),
    valor_icms: valorIcms,
    tem_st: temST,
    cest,
    mva,
    base_calculo_st: temST ? baseST : undefined,
    aliquota_icms_st: temST ? aliquotaST : undefined,
    valor_icms_st: temST ? valorST : undefined,
    tem_difal: temDifal,
    aliquota_destino: aliqDestino,
    valor_difal: temDifal ? valorDifal : undefined,
    reducao_base_pct: reducao || undefined,
    observacao: temST
      ? `ICMS-ST aplicado (CEST ${cest ?? "—"}, MVA ${mva}%)`
      : temDifal
      ? `DIFAL aplicado (B2C ${ufOrigem}→${ufDestino})`
      : undefined,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Lista CSTs aplicáveis para empresa (regime)
export function listarCSTsIcmsAplicaveis(regime: string) {
  if (regime === "SIMPLES_NACIONAL" || regime === "MEI") return CSOSN_SN;
  return CSTS_ICMS_NORMAL;
}
