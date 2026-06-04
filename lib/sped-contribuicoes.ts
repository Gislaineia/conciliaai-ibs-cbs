/**
 * Gerador SPED EFD Contribuições (PIS/COFINS).
 * Layout: blocos 0, A, C, D, M (M200/M210/M600/M610), 9.
 * Conforme IN RFB 2.121/2022.
 */
import type {
  Empresa,
  Documento,
  ItemDocumento,
  Apuracao,
} from "@/types";
import { md5 } from "./utils";

export interface SpedContribInput {
  empresa: Empresa;
  apuracao: Apuracao;
  documentos: Array<Documento & { itens: ItemDocumento[] }>;
}

export interface SpedContribOutput {
  conteudo: string;
  hash_md5: string;
  total_linhas: number;
  totais_por_bloco: Record<string, number>;
  erros: string[];
  // resumo de apuração
  pis_debitos: number;
  pis_creditos: number;
  pis_saldo: number;
  cofins_debitos: number;
  cofins_creditos: number;
  cofins_saldo: number;
}

function fmt(n: number, decimals = 2): string {
  return Number(n ?? 0).toFixed(decimals).replace(".", ",");
}
function fmtAliq(n: number) { return fmt(n, 4); }
function fmtData(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d.replace(/\D/g, "");
  return `${day}${m}${y}`;
}
function fmtPeriodo(p: string): { dt_ini: string; dt_fin: string } {
  const [y, m] = p.split("-");
  const yNum = Number(y);
  const mNum = Number(m);
  const lastDay = new Date(yNum, mNum, 0).getDate();
  const mm = String(mNum).padStart(2, "0");
  const last = String(lastDay).padStart(2, "0");
  return { dt_ini: `01${mm}${y}`, dt_fin: `${last}${mm}${y}` };
}

class Builder {
  private linhas: string[] = [];
  private contagem: Record<string, number> = {};
  add(reg: string, campos: (string | number)[]) {
    const c = campos.map((x) => (x === null || x === undefined ? "" : String(x)));
    this.linhas.push(`|${reg}|${c.join("|")}|`);
    this.contagem[reg] = (this.contagem[reg] ?? 0) + 1;
  }
  count(r: string) { return this.contagem[r] ?? 0; }
  get totals() { return { ...this.contagem }; }
  get content(): string { return this.linhas.join("\r\n") + "\r\n"; }
  get totalLinhas() { return this.linhas.length; }
  porBloco(): Record<string, number> {
    const r: Record<string, number> = {};
    for (const [reg, q] of Object.entries(this.contagem)) {
      r[reg.charAt(0)] = (r[reg.charAt(0)] ?? 0) + q;
    }
    return r;
  }
}

// Alíquotas PIS/COFINS por regime
function aliquotasPisCofins(empresa: Empresa) {
  if (empresa.regime_pis_cofins === "nao_cumulativo") {
    return { pis: 1.65, cofins: 7.6 };
  }
  return { pis: 0.65, cofins: 3.0 }; // cumulativo
}

export function gerarSpedContribuicoes(input: SpedContribInput): SpedContribOutput {
  const { empresa, apuracao, documentos } = input;
  const erros: string[] = [];
  if (empresa.regime_tributario === "SIMPLES_NACIONAL" || empresa.regime_tributario === "MEI") {
    erros.push("Empresa Simples Nacional/MEI não entrega EFD Contribuições.");
  }

  const sb = new Builder();
  const { dt_ini, dt_fin } = fmtPeriodo(apuracao.periodo);
  const aliq = aliquotasPisCofins(empresa);
  const indNatPj =
    empresa.regime_tributario === "LUCRO_REAL" ? "1" :
    empresa.regime_tributario === "LUCRO_PRESUMIDO" ? "2" : "9";
  const indAtiv = "1"; // Mercantil/Comercial — futuro: configurável

  // 0000 — Abertura
  sb.add("0000", [
    "006",                                      // COD_VER (versão layout)
    indAtiv,
    "0",                                        // COD_FIN (0=remessa regular)
    dt_ini, dt_fin,
    empresa.razao_social.substring(0, 100),
    empresa.cnpj.replace(/\D/g, ""),
    empresa.uf,
    "",                                         // IE
    empresa.cod_municipio_ibge,
    "",                                         // IM
    "",                                         // SUFRAMA
    indNatPj,
    "0",                                        // IND_ATIV (Apuração da Contribuição: 0=mensal)
  ]);

  // 0001 abertura
  sb.add("0001", ["0"]);

  // 0110 — Regimes de Apuração
  const indCumulativa = empresa.regime_pis_cofins === "cumulativo" ? "1" : "2";
  sb.add("0110", [
    indCumulativa,                              // COD_INC_TRIB (1=cumulativo, 2=não-cumulativo, 3=ambos)
    "1",                                        // IND_APRO_CRED (vinculado: 1=apropriação direta, 2=rateio proporcional)
    "1",                                        // COD_TIPO_CONT (1=mensal, 2=trimestral)
    "",                                         // IND_REG_CUM (cumulativo: 1=lucro presumido, 2=lucro arbitrado, 9=demais)
  ]);

  // 0140 — Estabelecimento (matriz)
  sb.add("0140", [
    "001",                                      // COD_EST
    empresa.razao_social.substring(0, 100),
    empresa.cnpj.replace(/\D/g, ""),
    empresa.uf,
    "",                                         // IE
    empresa.cod_municipio_ibge,
    "",                                         // IM
    "",                                         // SUFRAMA
  ]);

  // 0150 — Participantes
  const partMap = new Map<string, string>();
  let partCount = 1;
  const cnpjs = new Set<string>();
  for (const d of documentos) {
    if (d.cnpj_emitente) cnpjs.add(d.cnpj_emitente);
    if (d.cnpj_destinatario) cnpjs.add(d.cnpj_destinatario);
  }
  for (const cnpj of cnpjs) {
    const cod = `P${String(partCount++).padStart(4, "0")}`;
    partMap.set(cnpj, cod);
    const docRef = documentos.find((x) => x.cnpj_emitente === cnpj || x.cnpj_destinatario === cnpj);
    sb.add("0150", [
      cod,
      (docRef?.razao_emitente ?? "").substring(0, 100),
      "1058",                                   // COD_PAIS BR
      cnpj.replace(/\D/g, ""),
      "", "",                                   // CPF, IE
      docRef?.uf_emitente ?? "",
      "",                                       // COD_MUN
      "", "", "",                               // SUFRAMA, END, NUM
      "",                                       // COMPL
      "",                                       // BAIRRO
    ]);
  }

  // 0190 — unidades, 0200 — itens
  const unidades = new Set<string>();
  for (const d of documentos) for (const i of d.itens) if (i.unidade) unidades.add(i.unidade);
  for (const u of unidades) sb.add("0190", [u, u]);

  const itensCadastro = new Map<string, ItemDocumento>();
  for (const d of documentos)
    for (const i of d.itens) {
      const cod = i.codigo_produto ?? `ITEM-${i.id.substring(0, 6)}`;
      if (!itensCadastro.has(cod)) itensCadastro.set(cod, i);
    }
  for (const [cod, i] of itensCadastro.entries()) {
    sb.add("0200", [
      cod,
      i.descricao.substring(0, 100),
      "", "", "", "00", i.ncm ?? "", "", "", "", "", "",
    ]);
  }

  // 0990 fechamento bloco 0
  sb.add("0990", [
    String(
      sb.count("0000") + sb.count("0001") + sb.count("0110") +
      sb.count("0140") + sb.count("0150") + sb.count("0190") +
      sb.count("0200") + 1
    ),
  ]);

  // BLOCO A — NFS-e
  sb.add("A001", ["0"]);
  const nfses = documentos.filter((d) => d.tipo === "NFSe");
  for (const d of nfses) {
    const codPart = partMap.get(d.cnpj_emitente) ?? "";
    sb.add("A100", [
      d.direcao === "SAIDA" ? "1" : "0",
      "1",                                      // EMITENTE
      codPart,
      "99",                                     // COD_SIT
      "",                                       // SER
      "",                                       // SUB
      d.numero_doc ?? "",
      d.chave_acesso,
      fmtData(d.data_emissao),
      fmtData(d.data_emissao),
      fmt(d.valor_total),
      "0", "", "", fmt(d.valor_total),          // IND_PGTO, VL_DESC, VL_BC_PIS, VL_PIS...
      fmt(d.valor_pis),
      fmt(d.valor_cofins),
      "",                                       // VL_PIS_RET
      "",                                       // VL_COFINS_RET
      "",                                       // VL_ISS
    ]);
  }
  sb.add("A990", [String(sb.count("A001") + sb.count("A100") + 1)]);

  // BLOCO C — NF-e
  sb.add("C001", ["0"]);
  const nfes = documentos.filter((d) => d.tipo === "NFe");
  for (const d of nfes) {
    const codPart = partMap.get(d.cnpj_emitente) ?? "";
    sb.add("C100", [
      d.direcao === "SAIDA" ? "1" : "0",
      "1",
      codPart,
      "55", "00",
      d.serie ?? "",
      d.numero_doc ?? "",
      d.chave_acesso,
      fmtData(d.data_emissao),
      fmtData(d.data_entrada_saida ?? d.data_emissao),
      fmt(d.valor_total),
      "0",                                      // IND_PGTO
      "",                                       // VL_DESC
      "",                                       // VL_ABAT
      fmt(d.valor_produtos),
      "0",                                      // IND_FRT
      fmt(d.valor_frete),
      "", "",                                   // VL_SEG, VL_OUT
      fmt(d.valor_pis),
      fmt(d.valor_cofins),
    ]);
    // C170 — itens com PIS/COFINS
    for (const i of d.itens) {
      const codItem = i.codigo_produto ?? `ITEM-${i.id.substring(0, 6)}`;
      sb.add("C170", [
        String(i.numero_item),
        codItem,
        i.descricao.substring(0, 100),
        fmt(i.quantidade, 4),
        i.unidade ?? "",
        fmt(i.valor_total),
        "0",                                    // VL_DESC
        d.direcao === "SAIDA" ? "1" : "0",      // IND_MOV
        i.cst_icms ?? "",
        i.cfop ?? "",
        "",                                     // COD_NAT
        // PIS
        i.cst_pis ?? (d.direcao === "SAIDA" ? "01" : "50"),
        fmt(i.valor_total),
        fmtAliq(i.aliquota_pis || (d.direcao === "SAIDA" ? aliq.pis : aliq.pis)),
        "",                                     // QUANT_BC_PIS
        "",                                     // ALIQ_PIS_QUANT
        fmt(i.valor_pis),
        // COFINS
        i.cst_cofins ?? (d.direcao === "SAIDA" ? "01" : "50"),
        fmt(i.valor_total),
        fmtAliq(i.aliquota_cofins || (d.direcao === "SAIDA" ? aliq.cofins : aliq.cofins)),
        "",                                     // QUANT_BC_COFINS
        "",                                     // ALIQ_COFINS_QUANT
        fmt(i.valor_cofins),
      ]);
    }
  }
  sb.add("C990", [String(sb.count("C001") + sb.count("C100") + sb.count("C170") + 1)]);

  // BLOCO D — CT-e
  sb.add("D001", ["0"]);
  const ctes = documentos.filter((d) => d.tipo === "CTe");
  for (const d of ctes) {
    const codPart = partMap.get(d.cnpj_emitente) ?? "";
    sb.add("D100", [
      d.direcao === "SAIDA" ? "1" : "0",
      "1", codPart,
      "57", "00",
      d.serie ?? "",
      d.numero_doc ?? "",
      d.chave_acesso,
      fmtData(d.data_emissao),
      fmt(d.valor_total),
      "", "", fmt(d.valor_pis), fmt(d.valor_cofins),
    ]);
  }
  sb.add("D990", [String(sb.count("D001") + sb.count("D100") + 1)]);

  // BLOCO M — Apuração PIS/COFINS
  sb.add("M001", ["0"]);

  // Calcular agregados
  let pisDeb = 0, pisCred = 0, cofinsDeb = 0, cofinsCred = 0;
  for (const d of documentos) {
    for (const i of d.itens) {
      if (d.direcao === "SAIDA") {
        pisDeb += i.valor_pis || (i.valor_total * aliq.pis / 100);
        cofinsDeb += i.valor_cofins || (i.valor_total * aliq.cofins / 100);
      } else if (empresa.regime_pis_cofins === "nao_cumulativo") {
        pisCred += i.valor_pis || (i.valor_total * aliq.pis / 100);
        cofinsCred += i.valor_cofins || (i.valor_total * aliq.cofins / 100);
      }
    }
  }
  pisDeb = round2(pisDeb); pisCred = round2(pisCred);
  cofinsDeb = round2(cofinsDeb); cofinsCred = round2(cofinsCred);
  const pisSaldo = Math.max(0, pisDeb - pisCred);
  const cofinsSaldo = Math.max(0, cofinsDeb - cofinsCred);

  // M200 — Consolidação contribuição PIS
  sb.add("M200", [
    fmt(pisDeb),                                // VL_TOT_CONT_NC_PER (não cumulativo do período)
    "0,00",                                     // VL_TOT_CRED_DESC
    "0,00",                                     // VL_TOT_CRED_DESC_ANT
    "0,00",                                     // VL_TOT_CONT_NC_DEV
    fmt(pisCred),                               // VL_RET_NC
    fmt(pisSaldo),                              // VL_OUT_DED_NC
    "0,00",                                     // VL_CONT_NC_REC
    fmt(empresa.regime_pis_cofins === "cumulativo" ? pisDeb : 0), // VL_TOT_CONT_CUM_PER
    "0,00", "0,00",                             // VL_RET_CUM, VL_OUT_DED_CUM
    fmt(empresa.regime_pis_cofins === "cumulativo" ? Math.max(0, pisDeb - pisCred) : 0), // VL_CONT_CUM_REC
    fmt(pisSaldo),                              // VL_TOT_CONT_REC
  ]);

  // M210 — Detalhamento (uma linha por CST)
  sb.add("M210", [
    "01",                                       // COD_CONT — PIS Não Cumulativo
    fmt(pisDeb / Math.max(aliq.pis, 0.01) * 100),
    fmt(pisDeb),
    "",
    fmtAliq(aliq.pis),
    "",
    "",
    fmt(pisDeb),
    "0,00", "0,00", "0,00",
    fmt(pisDeb),
  ]);

  // M600 — Consolidação COFINS
  sb.add("M600", [
    fmt(cofinsDeb), "0,00", "0,00", "0,00",
    fmt(cofinsCred),
    fmt(cofinsSaldo),
    "0,00",
    fmt(empresa.regime_pis_cofins === "cumulativo" ? cofinsDeb : 0),
    "0,00", "0,00",
    fmt(empresa.regime_pis_cofins === "cumulativo" ? Math.max(0, cofinsDeb - cofinsCred) : 0),
    fmt(cofinsSaldo),
  ]);

  // M610 — Detalhamento COFINS
  sb.add("M610", [
    "51",                                       // COD_CONT — COFINS Não Cumulativo
    fmt(cofinsDeb / Math.max(aliq.cofins, 0.01) * 100),
    fmt(cofinsDeb),
    "",
    fmtAliq(aliq.cofins),
    "",
    "",
    fmt(cofinsDeb),
    "0,00", "0,00", "0,00",
    fmt(cofinsDeb),
  ]);

  // M990 — encerramento bloco M
  sb.add("M990", [
    String(
      sb.count("M001") + sb.count("M200") + sb.count("M210") +
      sb.count("M600") + sb.count("M610") + 1
    ),
  ]);

  // BLOCO 9
  sb.add("9001", ["0"]);
  const totals = sb.totals;
  for (const reg of Object.keys(totals).sort()) {
    sb.add("9900", [reg, String(totals[reg])]);
  }
  sb.add("9900", ["9001", String(sb.count("9001"))]);
  sb.add("9900", ["9900", String(sb.count("9900") + 1)]);
  sb.add("9900", ["9990", "1"]);
  sb.add("9900", ["9999", "1"]);

  const qtd9 = sb.count("9001") + sb.count("9900") + 1;
  sb.add("9990", [String(qtd9)]);
  sb.add("9999", [String(sb.totalLinhas + 1)]);

  const conteudo = sb.content;
  return {
    conteudo,
    hash_md5: md5(conteudo),
    total_linhas: sb.totalLinhas,
    totais_por_bloco: sb.porBloco(),
    erros,
    pis_debitos: pisDeb,
    pis_creditos: pisCred,
    pis_saldo: pisSaldo,
    cofins_debitos: cofinsDeb,
    cofins_creditos: cofinsCred,
    cofins_saldo: cofinsSaldo,
  };
}

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
