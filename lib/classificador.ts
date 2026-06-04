import type {
  Empresa,
  Documento,
  ItemDocumento,
  RegraClassificacao,
  NaturezaOperacao,
} from "@/types";
import { ALIQ_PRESUMIDA_CBS_SN, ALIQ_PRESUMIDA_IBS_SN } from "./aliquotas";

export interface ClassificacaoSugerida {
  natureza_operacao: NaturezaOperacao | null;
  cst_cbs: string | null;
  cst_ibs: string | null;
  gera_credito: boolean;
  motivo_vedacao: string | null;
  tipo_calculo_credito: "destacado" | "presumido" | "zero";
  aliquota_presumida_cbs: number;
  aliquota_presumida_ibs: number;
  classificado_por: "auto" | "manual" | "regra";
  regra_aplicada_id: string | null;
  confianca: number; // 0..1
  fonte: string;
}

// Tabela CFOP -> Natureza/CST (Passo 4 do escopo)
const TABELA_CFOP: Array<{
  prefix: string;
  natureza: NaturezaOperacao;
  cst_entrada: string;
  credito: boolean;
}> = [
  { prefix: "1102", natureza: "REVENDA", cst_entrada: "41", credito: true },
  { prefix: "2102", natureza: "REVENDA", cst_entrada: "41", credito: true },
  { prefix: "1101", natureza: "INSUMO", cst_entrada: "42", credito: true },
  { prefix: "2101", natureza: "INSUMO", cst_entrada: "42", credito: true },
  { prefix: "1551", natureza: "ATIVO_IMOB", cst_entrada: "44", credito: true },
  { prefix: "2551", natureza: "ATIVO_IMOB", cst_entrada: "44", credito: true },
  { prefix: "1556", natureza: "USO_CONSUMO", cst_entrada: "42", credito: true },
  { prefix: "2556", natureza: "USO_CONSUMO", cst_entrada: "42", credito: true },
  { prefix: "1353", natureza: "FRETE", cst_entrada: "42", credito: true },
  { prefix: "2353", natureza: "FRETE", cst_entrada: "42", credito: true },
  { prefix: "1933", natureza: "SERVICO", cst_entrada: "42", credito: true },
  { prefix: "2933", natureza: "SERVICO", cst_entrada: "42", credito: true },
  { prefix: "1949", natureza: "USO_PESSOAL", cst_entrada: "70", credito: false },
  { prefix: "2949", natureza: "USO_PESSOAL", cst_entrada: "70", credito: false },
  // Saídas (5xxx/6xxx)
  { prefix: "5102", natureza: "REVENDA", cst_entrada: "01", credito: false },
  { prefix: "6102", natureza: "REVENDA", cst_entrada: "01", credito: false },
  { prefix: "5101", natureza: "INSUMO", cst_entrada: "01", credito: false },
  { prefix: "6101", natureza: "INSUMO", cst_entrada: "01", credito: false },
  { prefix: "5351", natureza: "FRETE", cst_entrada: "01", credito: false },
  { prefix: "6351", natureza: "FRETE", cst_entrada: "01", credito: false },
  { prefix: "5933", natureza: "SERVICO", cst_entrada: "01", credito: false },
  { prefix: "6933", natureza: "SERVICO", cst_entrada: "01", credito: false },
];

function vazio(): ClassificacaoSugerida {
  return {
    natureza_operacao: null,
    cst_cbs: null,
    cst_ibs: null,
    gera_credito: false,
    motivo_vedacao: null,
    tipo_calculo_credito: "destacado",
    aliquota_presumida_cbs: 0,
    aliquota_presumida_ibs: 0,
    classificado_por: "auto",
    regra_aplicada_id: null,
    confianca: 0,
    fonte: "indeterminado",
  };
}

export function classificarItem(
  empresa: Empresa,
  documento: Pick<
    Documento,
    "direcao" | "crt_emitente" | "uf_emitente" | "cnpj_emitente" | "cfop_principal"
  >,
  item: Pick<ItemDocumento, "ncm" | "cfop" | "valor_total" | "descricao">,
  regras: RegraClassificacao[] = []
): ClassificacaoSugerida {
  const out = vazio();

  // PASSO 1 — Regime do comprador
  if (empresa.regime_tributario === "SIMPLES_NACIONAL" || empresa.regime_tributario === "MEI") {
    out.gera_credito = false;
    out.cst_cbs = "07"; // não contribuinte / não toma crédito
    out.cst_ibs = "07";
    out.motivo_vedacao = "Empresa no regime SN/MEI — não toma crédito IBS/CBS (DAS).";
    out.fonte = "regime_comprador";
    out.confianca = 0.9;
    return out;
  }

  // PASSO 2 — CRT do fornecedor (apenas em entradas)
  if (documento.direcao === "ENTRADA") {
    const crt = String(documento.crt_emitente ?? "");
    if (crt === "1") {
      // Fornecedor SN — sem destaque por padrão -> crédito presumido
      out.cst_cbs = "40";
      out.cst_ibs = "40";
      out.tipo_calculo_credito = "presumido";
      out.aliquota_presumida_cbs = ALIQ_PRESUMIDA_CBS_SN;
      out.aliquota_presumida_ibs = ALIQ_PRESUMIDA_IBS_SN;
      out.gera_credito = true;
      out.fonte = "fornecedor_sn_presumido";
      out.confianca = 0.7;
      // não retornamos ainda — natureza pode vir de CFOP/regra abaixo
    }
  }

  // PASSO 3 — Regras cadastradas
  const ncm = String(item.ncm ?? "");
  const cfop = String(item.cfop ?? documento.cfop_principal ?? "");
  const uf = String(documento.uf_emitente ?? "");
  const crt = String(documento.crt_emitente ?? "");
  const cnpjEmit = String(documento.cnpj_emitente ?? "");

  const regrasOrdenadas = [...regras]
    .filter((r) => r.ativa)
    .sort((a, b) => a.prioridade - b.prioridade);

  const matched = regrasOrdenadas.find((r) => {
    if (r.empresa_id !== empresa.id) return false;
    if (r.ncm_prefixo && !ncm.startsWith(r.ncm_prefixo)) return false;
    if (r.cfop && r.cfop !== cfop) return false;
    if (r.uf_emitente && r.uf_emitente !== uf) return false;
    if (r.crt_emitente && r.crt_emitente !== crt) return false;
    if (r.cnpj_emitente && r.cnpj_emitente !== cnpjEmit) return false;
    if (r.direcao && r.direcao !== documento.direcao) return false;
    if (r.natureza_contem) {
      const desc = String(item.descricao ?? "").toLowerCase();
      if (!desc.includes(r.natureza_contem.toLowerCase())) return false;
    }
    return true;
  });

  if (matched) {
    out.natureza_operacao = matched.natureza_destino ?? out.natureza_operacao;
    out.cst_cbs = matched.cst_cbs_destino ?? out.cst_cbs;
    out.cst_ibs = matched.cst_ibs_destino ?? out.cst_ibs;
    out.gera_credito = matched.gera_credito ?? out.gera_credito;
    out.motivo_vedacao = matched.motivo_vedacao ?? out.motivo_vedacao;
    out.classificado_por = "regra";
    out.regra_aplicada_id = matched.id;
    out.fonte = `regra:${matched.id.substring(0, 8)}`;
    out.confianca = 0.95;
    return out;
  }

  // PASSO 4 — Fallback por CFOP
  const found = TABELA_CFOP.find((t) => cfop.startsWith(t.prefix));
  if (found) {
    out.natureza_operacao = found.natureza;
    if (documento.direcao === "ENTRADA") {
      // se já estava como SN presumido (CST 40), preserva
      if (out.cst_cbs !== "40") {
        out.cst_cbs = found.cst_entrada;
        out.cst_ibs = found.cst_entrada;
      }
      out.gera_credito = found.credito && out.tipo_calculo_credito !== "zero";
    } else {
      out.cst_cbs = "01";
      out.cst_ibs = "01";
      out.gera_credito = false;
    }
    out.fonte = `cfop:${found.prefix}`;
    out.confianca = Math.max(out.confianca, 0.65);
    if (found.natureza === "USO_PESSOAL") {
      out.gera_credito = false;
      out.cst_cbs = "70";
      out.cst_ibs = "70";
      out.motivo_vedacao = "Uso pessoal — vedado pela LC 214/2025.";
    }
    if (found.natureza === "BENEFICIO_RH") {
      out.gera_credito = false;
      out.cst_cbs = "71";
      out.cst_ibs = "71";
      out.motivo_vedacao = "Benefício a empregado — sem direito a crédito.";
    }
  }

  return out;
}

// Calcula valores monetários CBS/IBS por item, considerando fase de transição.
export function calcularValoresIbsCbs(
  item: Pick<
    ItemDocumento,
    | "valor_total"
    | "aliquota_cbs"
    | "aliquota_ibs_estadual"
    | "aliquota_ibs_municipal"
    | "valor_cbs_ofertado"
    | "valor_ibs_est_ofertado"
    | "valor_ibs_mun_ofertado"
    | "tipo_calculo_credito"
    | "aliquota_presumida_cbs"
    | "aliquota_presumida_ibs"
  >,
  empresa: Pick<Empresa, "aliquota_cbs" | "aliquota_ibs_estadual" | "aliquota_ibs_municipal">,
  percentualTransicao: { cbs: number; ibs: number }
) {
  const aliqCbs = item.aliquota_cbs || empresa.aliquota_cbs;
  const aliqIbsEst = item.aliquota_ibs_estadual || empresa.aliquota_ibs_estadual;
  const aliqIbsMun = item.aliquota_ibs_municipal || empresa.aliquota_ibs_municipal;

  // Se já veio destacado no XML, usa o valor do XML
  const cbs =
    item.valor_cbs_ofertado > 0
      ? item.valor_cbs_ofertado
      : item.valor_total * (aliqCbs / 100) * percentualTransicao.cbs;

  const ibsEst =
    item.valor_ibs_est_ofertado > 0
      ? item.valor_ibs_est_ofertado
      : item.valor_total * (aliqIbsEst / 100) * percentualTransicao.ibs;

  const ibsMun =
    item.valor_ibs_mun_ofertado > 0
      ? item.valor_ibs_mun_ofertado
      : item.valor_total * (aliqIbsMun / 100) * percentualTransicao.ibs;

  // crédito presumido (SN sem destaque) — usa alíquotas presumidas
  const creditoPresumidoCbs =
    item.tipo_calculo_credito === "presumido"
      ? item.valor_total * (item.aliquota_presumida_cbs / 100) * percentualTransicao.cbs
      : 0;
  const creditoPresumidoIbs =
    item.tipo_calculo_credito === "presumido"
      ? item.valor_total * (item.aliquota_presumida_ibs / 100) * percentualTransicao.ibs
      : 0;

  return {
    valor_cbs_ofertado: round2(cbs),
    valor_ibs_est_ofertado: round2(ibsEst),
    valor_ibs_mun_ofertado: round2(ibsMun),
    base_calculo_cbs: round2(item.valor_total),
    base_calculo_ibs: round2(item.valor_total),
    aliquota_cbs: aliqCbs,
    aliquota_ibs_estadual: aliqIbsEst,
    aliquota_ibs_municipal: aliqIbsMun,
    credito_presumido_cbs: round2(creditoPresumidoCbs),
    credito_presumido_ibs: round2(creditoPresumidoIbs),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
