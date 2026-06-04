import type {
  Empresa,
  Documento,
  ItemDocumento,
  Apuracao,
  ApuracaoPorEnte,
} from "@/types";
import { md5 } from "./utils";

export interface SpedInput {
  empresa: Empresa;
  apuracao: Apuracao;
  documentos: Array<Documento & { itens: ItemDocumento[] }>;
  apuracoes_ente: ApuracaoPorEnte[];
}

export interface SpedOutput {
  conteudo: string;
  hash_md5: string;
  total_linhas: number;
  totais_por_bloco: Record<string, number>;
  erros: string[];
}

// formata número conforme layout SPED (vírgula como separador, sem milhar)
function fmt(n: number, decimals = 2): string {
  return Number(n ?? 0)
    .toFixed(decimals)
    .replace(".", ",");
}
function fmtAliq(n: number): string {
  return fmt(n, 2);
}
function fmtData(d: string): string {
  // entrada YYYY-MM-DD -> DDMMYYYY
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d.replace(/\D/g, "");
  return `${day}${m}${y}`;
}
function fmtPeriodo(p: string): { dt_ini: string; dt_fin: string } {
  // p = YYYY-MM
  const [y, m] = p.split("-");
  const yNum = Number(y);
  const mNum = Number(m);
  const lastDay = new Date(yNum, mNum, 0).getDate();
  const mm = String(mNum).padStart(2, "0");
  const last = String(lastDay).padStart(2, "0");
  return { dt_ini: `01${mm}${y}`, dt_fin: `${last}${mm}${y}` };
}

class SpedBuilder {
  private linhas: string[] = [];
  private contagem: Record<string, number> = {};

  add(reg: string, campos: (string | number)[]) {
    const campoStr = campos.map((c) => (c === null || c === undefined ? "" : String(c)));
    const linha = `|${reg}|${campoStr.join("|")}|`;
    this.linhas.push(linha);
    this.contagem[reg] = (this.contagem[reg] ?? 0) + 1;
  }

  count(reg: string): number {
    return this.contagem[reg] ?? 0;
  }
  get totals() {
    return { ...this.contagem };
  }
  get content(): string {
    return this.linhas.join("\r\n") + "\r\n";
  }
  get totalLinhas(): number {
    return this.linhas.length;
  }
  blocosUsados(): string[] {
    const blocos = new Set<string>();
    for (const reg of Object.keys(this.contagem)) {
      blocos.add(reg.charAt(0));
    }
    return Array.from(blocos);
  }
  contagemPorBloco(): Record<string, number> {
    const res: Record<string, number> = {};
    for (const [reg, qtd] of Object.entries(this.contagem)) {
      const b = reg.charAt(0);
      res[b] = (res[b] ?? 0) + qtd;
    }
    return res;
  }
}

export function gerarSped(input: SpedInput): SpedOutput {
  const { empresa, apuracao, documentos, apuracoes_ente } = input;
  const erros: string[] = [];

  // Regra: SN/MEI não geram EFD ICMS/IPI com Bloco N
  if (empresa.regime_tributario === "SIMPLES_NACIONAL") {
    erros.push("Empresa Simples Nacional não gera Bloco N (IBS/CBS no DAS).");
  }
  if (empresa.regime_tributario === "MEI") {
    erros.push("MEI não gera EFD ICMS/IPI.");
  }

  const sb = new SpedBuilder();
  const { dt_ini, dt_fin } = fmtPeriodo(apuracao.periodo);

  const indPerfil = "A"; // perfil A — mais detalhado
  const indAtiv = "0"; // industrial/equiparado

  const indRegimeComprador =
    empresa.regime_tributario === "LUCRO_REAL" ? "01"
    : empresa.regime_tributario === "LUCRO_PRESUMIDO" ? "02"
    : "03";

  // BLOCO 0
  sb.add("0000", [
    "018", // COD_VER
    "0",   // COD_FIN (0=remessa regular)
    dt_ini,
    dt_fin,
    empresa.razao_social.substring(0, 100),
    empresa.cnpj.replace(/\D/g, ""),
    "",    // CPF
    empresa.uf,
    "",    // IE
    empresa.cod_municipio_ibge,
    "",    // IM
    "",    // IE_ST
    indPerfil,
    indAtiv,
  ]);
  sb.add("0001", ["0"]);
  sb.add("0005", [
    empresa.nome_fantasia ?? empresa.razao_social,
    "", "", "", "", "", "", "", "", // CEP, END, NUM, COMPL, BAIRRO, FONE, FAX, EMAIL
  ]);
  // 0015 (NOVO) — alíquotas IBS/CBS vigentes
  sb.add("0015", [
    fmtAliq(empresa.aliquota_cbs),
    fmtAliq(empresa.aliquota_ibs_estadual),
    fmtAliq(empresa.aliquota_ibs_municipal),
    String(empresa.ano_vigencia_aliquota),
  ]);

  // 0150 — participantes (emitentes/destinatários)
  const participantes = new Map<string, Documento>();
  for (const d of documentos) {
    if (d.cnpj_emitente) participantes.set(d.cnpj_emitente, d);
    if (d.cnpj_destinatario) participantes.set(d.cnpj_destinatario, d);
  }
  let codPart = 1;
  const codPartMap = new Map<string, string>();
  for (const [cnpj, doc] of participantes.entries()) {
    const cod = `P${String(codPart++).padStart(4, "0")}`;
    codPartMap.set(cnpj, cod);
    sb.add("0150", [
      cod,
      (doc.razao_emitente ?? "").substring(0, 100),
      "1058", // BR
      cnpj.replace(/\D/g, ""),
      "", // CPF
      "", // IE
      doc.uf_emitente ?? "",
      "", // COD_MUN
      "", "", "", "", // SUFRAMA, END, NUM, COMPL
      "", // BAIRRO
    ]);
  }

  // 0190 — unidades de medida usadas
  const unidades = new Set<string>();
  for (const d of documentos)
    for (const i of d.itens) if (i.unidade) unidades.add(i.unidade);
  for (const u of unidades) sb.add("0190", [u, u]);

  // 0200 — itens
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
      "", // COD_BARRA
      "", // COD_ANT
      i.unidade ?? "",
      "00", // TIPO_ITEM (00=mercadoria revenda)
      i.ncm ?? "",
      "", "", // EX_IPI, COD_GEN
      "", // COD_LST
      fmtAliq(i.aliquota_icms),
      // extensões IBS/CBS (escopo)
      fmtAliq(i.aliquota_cbs),
      fmtAliq(i.aliquota_ibs_estadual),
      fmtAliq(i.aliquota_ibs_municipal),
    ]);
  }

  sb.add("0990", [String(sb.count("0000") + sb.count("0001") + sb.count("0005") +
    sb.count("0015") + sb.count("0150") + sb.count("0190") + sb.count("0200") + 1)]);

  // BLOCO C — NF-e
  sb.add("C001", ["0"]);
  const nfes = documentos.filter((d) => d.tipo === "NFe");
  for (const d of nfes) {
    const codPart = codPartMap.get(d.cnpj_emitente) ?? "";
    const indOper = d.direcao === "SAIDA" ? "1" : "0";
    sb.add("C100", [
      indOper,                               // IND_OPER
      "1",                                   // IND_EMIT (0=própria, 1=terceiros)
      codPart,
      "55",                                  // COD_MOD
      "00",                                  // COD_SIT
      d.serie ?? "",
      d.numero_doc ?? "",
      d.chave_acesso,
      fmtData(d.data_emissao),
      fmtData(d.data_entrada_saida ?? d.data_emissao),
      fmt(d.valor_total),
      "", "", // IND_PGTO, VL_DESC
      "", // VL_ABAT_NT
      "", // VL_MERC
      "0", // IND_FRT
      fmt(d.valor_frete),
      "", "", // VL_SEG, VL_OUT_DA
      fmt(d.valor_icms),
      "", "", // VL_BC_ICMS_ST, VL_ICMS_ST
      fmt(d.valor_ipi),
      fmt(d.valor_pis),
      fmt(d.valor_cofins),
      "", "", // VL_PIS_ST, VL_COFINS_ST
    ]);

    // C170 — itens do documento (CRÍTICO IBS/CBS)
    for (const i of d.itens) {
      const codItem = i.codigo_produto ?? `ITEM-${i.id.substring(0, 6)}`;
      sb.add("C170", [
        String(i.numero_item),
        codItem,
        i.descricao.substring(0, 100),
        fmt(i.quantidade, 4),
        i.unidade ?? "",
        fmt(i.valor_total),
        "0", // VL_DESC
        d.direcao === "SAIDA" ? "1" : "0", // IND_MOV
        i.cst_icms ?? "",
        i.cfop ?? "",
        "", // COD_NAT
        fmt(i.base_calculo_cbs || i.valor_total),
        fmtAliq(i.aliquota_icms),
        fmt(i.valor_icms),
        // IPI
        i.cst_ipi ?? "",
        fmt(i.valor_ipi),
        fmtAliq(0),
        fmt(i.valor_ipi),
        // PIS
        i.cst_pis ?? "",
        fmt(i.valor_pis),
        fmtAliq(i.aliquota_pis),
        fmt(i.valor_pis),
        // COFINS
        i.cst_cofins ?? "",
        fmt(i.valor_cofins),
        fmtAliq(i.aliquota_cofins),
        fmt(i.valor_cofins),
        // CBS
        i.cst_cbs ?? "",
        fmt(i.base_calculo_cbs || i.valor_total),
        fmtAliq(i.aliquota_cbs),
        fmt(i.valor_cbs_ofertado),
        fmt(i.valor_credito_cbs),
        // IBS
        i.cst_ibs ?? "",
        fmt(i.base_calculo_ibs || i.valor_total),
        fmtAliq(i.aliquota_ibs_estadual),
        fmt(i.valor_ibs_est_ofertado),
        fmt(i.valor_credito_ibs_est),
        fmtAliq(i.aliquota_ibs_municipal),
        fmt(i.valor_ibs_mun_ofertado),
        fmt(i.valor_credito_ibs_mun),
      ]);
    }
  }
  sb.add("C990", [String(
    sb.count("C001") + sb.count("C100") + sb.count("C170") + 1
  )]);

  // BLOCO D — CT-e
  sb.add("D001", ["0"]);
  const ctes = documentos.filter((d) => d.tipo === "CTe");
  for (const d of ctes) {
    const codPart = codPartMap.get(d.cnpj_emitente) ?? "";
    sb.add("D100", [
      d.direcao === "SAIDA" ? "1" : "0",
      "1",
      codPart,
      "57",
      "00",
      d.serie ?? "",
      "0", // SUB
      d.numero_doc ?? "",
      d.chave_acesso,
      fmtData(d.data_emissao),
      fmt(d.valor_total),
      "", // VL_DESC
      "", // IND_FRT
      fmt(d.valor_total),
      "", "", // VL_SEG, VL_OUT
      fmt(d.valor_icms),
      // IBS/CBS
      fmt(d.valor_cbs_documento),
      fmt(d.valor_ibs_documento),
    ]);
  }
  sb.add("D990", [String(sb.count("D001") + sb.count("D100") + 1)]);

  // BLOCO E — Apuração ICMS e IPI (v4)
  if (empresa.contribuinte_icms !== false) {
    sb.add("E001", ["0"]);
    sb.add("E100", [dt_ini, dt_fin]);

    // Calcular agregados ICMS
    let icmsDebSaida = 0, icmsCredEntrada = 0;
    let ipiDebSaida = 0, ipiCredEntrada = 0;
    for (const d of documentos) {
      for (const i of d.itens) {
        if (d.direcao === "SAIDA") {
          icmsDebSaida += i.valor_icms ?? 0;
          ipiDebSaida += i.valor_ipi ?? 0;
        } else {
          icmsCredEntrada += i.valor_icms ?? 0;
          ipiCredEntrada += i.valor_ipi ?? 0;
        }
      }
    }
    const icmsSaldoCredor = Math.max(0, icmsCredEntrada - icmsDebSaida);
    const icmsSaldoPagar = Math.max(0, icmsDebSaida - icmsCredEntrada);

    // E110 — Apuração ICMS
    sb.add("E110", [
      fmt(icmsDebSaida),                        // VL_TOT_DEBITOS
      "0,00",                                   // VL_AJ_DEBITOS
      "0,00",                                   // VL_TOT_AJ_DEBITOS
      "0,00",                                   // VL_ESTORNOS_CRED
      fmt(icmsCredEntrada),                     // VL_TOT_CREDITOS
      "0,00",                                   // VL_AJ_CREDITOS
      "0,00",                                   // VL_TOT_AJ_CREDITOS
      "0,00",                                   // VL_ESTORNOS_DEB
      "0,00",                                   // VL_SLD_CREDOR_ANT
      fmt(icmsSaldoPagar),                      // VL_SLD_APURADO
      "0,00",                                   // VL_TOT_DED
      fmt(icmsSaldoPagar),                      // VL_ICMS_RECOLHER
      fmt(icmsSaldoCredor),                     // VL_SLD_CREDOR_TRANSPORTAR
      "0,00",                                   // DEB_ESP
    ]);

    // E116 — Obrigações a recolher (uma linha por código de receita)
    if (icmsSaldoPagar > 0) {
      sb.add("E116", [
        "000",                                  // COD_OR (a definir por UF)
        fmt(icmsSaldoPagar),
        // Vencimento — dia 20 do mês seguinte
        fmtData((() => {
          const [y, m] = apuracao.periodo.split("-");
          const next = new Date(Number(y), Number(m), 20).toISOString().substring(0, 10);
          return next;
        })()),
        "ICMS",
        "",                                     // MES_REF
        "",                                     // COD_REC
        "",                                     // NUM_PROC
        "",                                     // IND_PROC
        "",                                     // PROC
        "",                                     // TXT_COMPL
      ]);
    }

    // E500 — Período IPI
    if (empresa.contribuinte_ipi) {
      sb.add("E500", ["0", dt_ini, dt_fin]);    // IND_APUR (0=mensal)

      // E520 — Apuração IPI
      const ipiSaldoPagar = Math.max(0, ipiDebSaida - ipiCredEntrada);
      const ipiSaldoCredor = Math.max(0, ipiCredEntrada - ipiDebSaida);
      sb.add("E520", [
        "0,00",                                 // VL_SD_ANT_IPI
        fmt(ipiDebSaida),                       // VL_DEB_IPI
        fmt(ipiCredEntrada),                    // VL_CRED_IPI
        "0,00",                                 // VL_OD_IPI (outros débitos)
        "0,00",                                 // VL_OC_IPI (outros créditos)
        fmt(ipiSaldoCredor),                    // VL_SC_IPI (saldo credor)
        fmt(ipiSaldoPagar),                     // VL_SD_IPI (saldo devedor)
      ]);
    }

    sb.add("E990", [
      String(
        sb.count("E001") + sb.count("E100") + sb.count("E110") + sb.count("E116") +
        sb.count("E500") + sb.count("E520") + 1
      ),
    ]);
  }

  // BLOCO N — Apuração IBS/CBS
  if (empresa.regime_tributario === "LUCRO_REAL" || empresa.regime_tributario === "LUCRO_PRESUMIDO") {
    sb.add("N001", ["0"]);
    sb.add("N100", [
      dt_ini,
      dt_fin,
      fmt(apuracao.cbs_debitos),
      fmt(apuracao.cbs_creditos),
      fmt(apuracao.ibs_est_debitos + apuracao.ibs_mun_debitos),
      fmt(apuracao.ibs_est_creditos + apuracao.ibs_mun_creditos),
      fmt(apuracao.percentual_cbs * 100, 4),
      fmt(apuracao.percentual_ibs * 100, 4),
      apuracao.fase_transicao,
    ]);

    // CBS — débitos por CST (consolidados)
    const debitosCbsPorCst = new Map<string, { vbc: number; aliq: number; valor: number }>();
    const creditosCbsPorCst = new Map<string, { vbc: number; aliq: number; valor: number }>();
    for (const d of documentos) {
      for (const i of d.itens) {
        if (d.direcao === "SAIDA") {
          const k = i.cst_cbs ?? "01";
          const cur = debitosCbsPorCst.get(k) ?? { vbc: 0, aliq: i.aliquota_cbs, valor: 0 };
          cur.vbc += i.base_calculo_cbs || i.valor_total;
          cur.valor += i.valor_cbs_ofertado;
          debitosCbsPorCst.set(k, cur);
        } else if (i.gera_credito) {
          const k = i.cst_cbs ?? "42";
          const cur = creditosCbsPorCst.get(k) ?? { vbc: 0, aliq: i.aliquota_cbs, valor: 0 };
          cur.vbc += i.base_calculo_cbs || i.valor_total;
          cur.valor += i.valor_credito_cbs;
          creditosCbsPorCst.set(k, cur);
        }
      }
    }
    for (const [cst, v] of debitosCbsPorCst.entries()) {
      sb.add("N110", [cst, fmt(v.vbc), fmtAliq(v.aliq), fmt(v.valor)]);
    }
    for (const [cst, v] of creditosCbsPorCst.entries()) {
      const tipo = cst === "40" ? "PRESUMIDO" : "INTEGRAL";
      sb.add("N120", [cst, tipo, fmt(v.vbc), fmtAliq(v.aliq), fmt(v.valor)]);
    }

    // N130 — Ajustes (vazio se não há)
    if (apuracao.cbs_ajustes !== 0) {
      sb.add("N130", [
        apuracao.cbs_ajustes >= 0 ? "0" : "1",
        fmt(Math.abs(apuracao.cbs_ajustes)),
        "AJ001",
        "",
        "Ajuste manual",
        dt_fin,
      ]);
    }
    // N140 — Consolidação CBS
    sb.add("N140", [
      fmt(apuracao.cbs_debitos),
      fmt(apuracao.cbs_creditos),
      fmt(apuracao.cbs_ajustes),
      fmt(apuracao.cbs_saldo_anterior),
      fmt(apuracao.cbs_saldo_pagar),
      fmt(apuracao.cbs_saldo_credor),
    ]);

    // N150/N160 — IBS por ente
    for (const ente of apuracoes_ente) {
      if (ente.tipo_ente === "ESTADO") {
        sb.add("N150", [
          ente.uf ?? "",
          fmtAliq(ente.aliquota),
          fmt(ente.base_calculo),
          fmt(ente.debitos),
          fmt(ente.creditos),
          fmt(ente.saldo_pagar),
          fmt(ente.saldo_credor),
        ]);
      } else {
        sb.add("N160", [
          ente.cod_municipio_ibge ?? "",
          (ente.nome_ente ?? "").substring(0, 60),
          fmtAliq(ente.aliquota),
          fmt(ente.base_calculo),
          fmt(ente.debitos),
          fmt(ente.creditos),
          fmt(ente.saldo_pagar),
          fmt(ente.saldo_credor),
        ]);
      }
    }

    // N170 — Consolidação IBS total
    sb.add("N170", [
      fmt(apuracao.ibs_est_debitos),
      fmt(apuracao.ibs_mun_debitos),
      fmt(apuracao.ibs_est_saldo_pagar + apuracao.ibs_mun_saldo_pagar),
      fmt(apuracao.ibs_est_saldo_credor + apuracao.ibs_mun_saldo_credor),
    ]);

    // N190 — encerramento (qtd_lin do bloco N)
    const qtdN =
      sb.count("N001") + sb.count("N100") + sb.count("N110") + sb.count("N120") +
      sb.count("N130") + sb.count("N140") + sb.count("N150") + sb.count("N160") +
      sb.count("N170") + 1;
    sb.add("N190", [String(qtdN)]);
  }

  // BLOCO 9 — encerramento
  sb.add("9001", ["0"]);
  // 9900 — totalizador por registro
  const todasContagens = sb.totals;
  const todosRegistros = Object.keys(todasContagens).sort();
  // adicionar 9900 / 9990 / 9999 ao totalizador
  for (const reg of todosRegistros) {
    sb.add("9900", [reg, String(todasContagens[reg])]);
  }
  // contar 9900 que serão adicionados (1 para cada registro + 1 para 9001 + 1 para 9900 ele mesmo + 9990 + 9999)
  // estratégia simples: adicionar 9900 para 9001, 9900 (já vai), 9990, 9999
  sb.add("9900", ["9001", String(sb.count("9001"))]);
  sb.add("9900", ["9900", String(sb.count("9900") + 1)]); // +1 = este próprio
  sb.add("9900", ["9990", "1"]);
  sb.add("9900", ["9999", "1"]);

  const qtd9 = sb.count("9001") + sb.count("9900") + 1; // +9990
  sb.add("9990", [String(qtd9)]);
  sb.add("9999", [String(sb.totalLinhas + 1)]);

  const conteudo = sb.content;
  const hash = md5(conteudo);

  return {
    conteudo,
    hash_md5: hash,
    total_linhas: sb.totalLinhas,
    totais_por_bloco: sb.contagemPorBloco(),
    erros,
  };
}

// validador de layout simples
export function validarSped(conteudo: string): {
  ok: boolean;
  erros: Array<{ linha: number; mensagem: string }>;
} {
  const erros: Array<{ linha: number; mensagem: string }> = [];
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.length > 0);
  if (linhas.length === 0) {
    return { ok: false, erros: [{ linha: 0, mensagem: "Arquivo vazio." }] };
  }
  if (!linhas[0].startsWith("|0000|")) {
    erros.push({ linha: 1, mensagem: "Primeira linha deve ser registro 0000." });
  }
  const last = linhas[linhas.length - 1];
  if (!last.startsWith("|9999|")) {
    erros.push({ linha: linhas.length, mensagem: "Última linha deve ser registro 9999." });
  }
  linhas.forEach((l, idx) => {
    if (!l.startsWith("|") || !l.endsWith("|")) {
      erros.push({ linha: idx + 1, mensagem: "Linha não delimitada por pipe (|)." });
    }
  });
  return { ok: erros.length === 0, erros };
}
