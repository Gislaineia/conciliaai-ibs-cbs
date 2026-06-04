import { XMLParser } from "fast-xml-parser";
import type { Documento, ItemDocumento, TipoDoc, CRT, DirecaoDoc } from "@/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

export interface ParsedDocumento {
  documento: Omit<Documento, "id" | "empresa_id" | "criado_em">;
  itens: Array<Omit<ItemDocumento, "id" | "documento_id" | "criado_em">>;
  raw_xml: string;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function getDeep<T = unknown>(obj: any, path: string[]): T | undefined {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur as T;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function detectType(root: any): TipoDoc {
  if (root.nfeProc?.NFe || root.NFe) return "NFe";
  if (root.cteProc?.CTe || root.CTe) return "CTe";
  if (root.ConsultarNfseResposta || root.CompNfse || root.Nfse) return "NFSe";
  return "NFe";
}

function periodoFromDate(iso: string): string {
  const d = iso.length >= 7 ? iso.substring(0, 7) : new Date().toISOString().substring(0, 7);
  return d;
}

export function parseXMLDocument(xmlString: string): ParsedDocumento {
  const parsed = parser.parse(xmlString);
  const tipo = detectType(parsed);
  if (tipo === "NFe") return parseNFe(parsed, xmlString);
  if (tipo === "CTe") return parseCTe(parsed, xmlString);
  return parseNFSe(parsed, xmlString);
}

// ============== NF-e ==============
function parseNFe(parsed: any, xmlString: string): ParsedDocumento {
  const NFe = parsed.nfeProc?.NFe ?? parsed.NFe;
  const infNFe = NFe?.infNFe;
  if (!infNFe) throw new Error("XML NF-e inválido: infNFe ausente");

  const ide = infNFe.ide ?? {};
  const emit = infNFe.emit ?? {};
  const dest = infNFe.dest ?? {};
  const total = infNFe.total?.ICMSTot ?? {};

  const chave = String(infNFe["@_Id"] ?? "").replace(/^NFe/, "");
  const dhEmi = str(ide.dhEmi ?? ide.dEmi);
  const dataEmissao = dhEmi.substring(0, 10);
  const tpNF = str(ide.tpNF); // 0=entrada, 1=saída
  const direcao: DirecaoDoc = tpNF === "0" ? "ENTRADA" : "SAIDA";

  const enderEmit = emit.enderEmit ?? {};
  const enderDest = dest.enderDest ?? {};

  const detList = asArray(infNFe.det);
  const itens: ParsedDocumento["itens"] = detList.map((det: any, idx: number) => {
    const prod = det.prod ?? {};
    const imposto = det.imposto ?? {};

    // ICMS — vários CST possíveis dentro de imposto.ICMS.ICMSxx
    const icmsRoot = imposto.ICMS ?? {};
    const icmsKey = Object.keys(icmsRoot)[0];
    const icms = icmsKey ? icmsRoot[icmsKey] : {};
    // PIS/COFINS — idem
    const pisRoot = imposto.PIS ?? {};
    const pisKey = Object.keys(pisRoot)[0];
    const pis = pisKey ? pisRoot[pisKey] : {};
    const cofinsRoot = imposto.COFINS ?? {};
    const cofinsKey = Object.keys(cofinsRoot)[0];
    const cofins = cofinsKey ? cofinsRoot[cofinsKey] : {};
    // IPI
    const ipi = imposto.IPI?.IPITrib ?? imposto.IPI?.IPINT ?? {};

    // CBS / IBS (novos — podem não existir em XMLs antigos)
    const cbs = imposto.CBS ?? {};
    const ibs = imposto.IBS ?? {};

    return {
      numero_item: Number(det["@_nItem"] ?? idx + 1),
      codigo_produto: str(prod.cProd) || null,
      descricao: str(prod.xProd),
      ncm: str(prod.NCM) || null,
      cfop: str(prod.CFOP) || null,
      unidade: str(prod.uCom) || null,
      quantidade: num(prod.qCom),
      valor_unitario: num(prod.vUnCom),
      valor_total: num(prod.vProd),

      cst_icms: str(icms.CST ?? icms.CSOSN) || null,
      valor_icms: num(icms.vICMS),
      aliquota_icms: num(icms.pICMS),
      cst_ipi: str(ipi.CST) || null,
      valor_ipi: num(ipi.vIPI),
      cst_pis: str(pis.CST) || null,
      valor_pis: num(pis.vPIS),
      aliquota_pis: num(pis.pPIS),
      cst_cofins: str(cofins.CST) || null,
      valor_cofins: num(cofins.vCOFINS),
      aliquota_cofins: num(cofins.pCOFINS),

      cst_cbs: str(cbs.CST_CBS ?? cbs.CST) || null,
      cst_ibs: str(ibs.CST_IBS ?? ibs.CST) || null,
      aliquota_cbs: num(cbs.pCBS),
      aliquota_ibs_estadual: num(ibs.pIBSEst),
      aliquota_ibs_municipal: num(ibs.pIBSMun),
      valor_cbs_ofertado: num(cbs.vCBS),
      valor_ibs_est_ofertado: num(ibs.vIBSEst),
      valor_ibs_mun_ofertado: num(ibs.vIBSMun),
      valor_credito_cbs: 0,
      valor_credito_ibs_est: 0,
      valor_credito_ibs_mun: 0,
      base_calculo_cbs: num(cbs.vBC),
      base_calculo_ibs: num(ibs.vBC),
      tipo_calculo_credito: "destacado" as const,
      aliquota_presumida_cbs: 0,
      aliquota_presumida_ibs: 0,

      natureza_operacao: null,
      gera_credito: false,
      motivo_vedacao_credito: null,
      classificado_por: null,
      regra_aplicada_id: null,
      status_item: "pendente" as const,
      observacao_credito: null,
    };
  });

  const valor_total = num(total.vNF);
  const documento: ParsedDocumento["documento"] = {
    tipo: "NFe",
    chave_acesso: chave,
    numero_doc: str(ide.nNF) || null,
    serie: str(ide.serie) || null,
    data_emissao: dataEmissao || new Date().toISOString().substring(0, 10),
    data_entrada_saida: str(ide.dhSaiEnt).substring(0, 10) || null,
    cnpj_emitente: str(emit.CNPJ),
    razao_emitente: str(emit.xNome) || null,
    cnpj_destinatario: str(dest.CNPJ ?? dest.CPF) || null,
    uf_emitente: str(enderEmit.UF) || null,
    uf_destinatario: str(enderDest.UF) || null,
    municipio_emitente: str(enderEmit.xMun) || null,
    municipio_destinatario: str(enderDest.xMun) || null,
    cfop_principal: itens[0]?.cfop ?? null,
    direcao,
    crt_emitente: (str(emit.CRT) as CRT) || null,
    tipo_credito_fornecedor: null,
    valor_total,
    valor_produtos: num(total.vProd),
    valor_frete: num(total.vFrete),
    valor_ipi: num(total.vIPI),
    valor_icms: num(total.vICMS),
    valor_pis: num(total.vPIS),
    valor_cofins: num(total.vCOFINS),
    valor_cbs_documento: itens.reduce((s, i) => s + i.valor_cbs_ofertado, 0),
    valor_ibs_documento: itens.reduce(
      (s, i) => s + i.valor_ibs_est_ofertado + i.valor_ibs_mun_ofertado,
      0
    ),
    xml_original: xmlString,
    status_classificacao: "pendente",
    periodo_competencia: periodoFromDate(dataEmissao),
  };

  return { documento, itens, raw_xml: xmlString };
}

// ============== CT-e ==============
function parseCTe(parsed: any, xmlString: string): ParsedDocumento {
  const CTe = parsed.cteProc?.CTe ?? parsed.CTe;
  const infCte = CTe?.infCte;
  if (!infCte) throw new Error("XML CT-e inválido: infCte ausente");

  const ide = infCte.ide ?? {};
  const emit = infCte.emit ?? {};
  const dest = infCte.dest ?? {};
  const vPrest = infCte.vPrest ?? {};
  const imp = infCte.imp ?? {};
  const cbs = imp.CBS ?? {};
  const ibs = imp.IBS ?? {};

  const chave = String(infCte["@_Id"] ?? "").replace(/^CTe/, "");
  const dhEmi = str(ide.dhEmi);
  const dataEmissao = dhEmi.substring(0, 10);
  const tpCTe = str(ide.tpCTe);
  const direcao: DirecaoDoc = tpCTe === "0" ? "ENTRADA" : "SAIDA";

  const valorTotal = num(vPrest.vTPrest);
  const itens: ParsedDocumento["itens"] = [
    {
      numero_item: 1,
      codigo_produto: null,
      descricao: "Serviço de transporte (CT-e)",
      ncm: null,
      cfop: str(ide.CFOP) || null,
      unidade: null,
      quantidade: 1,
      valor_unitario: valorTotal,
      valor_total: valorTotal,
      cst_icms: null,
      valor_icms: num(imp.ICMS?.ICMS00?.vICMS),
      aliquota_icms: num(imp.ICMS?.ICMS00?.pICMS),
      cst_ipi: null,
      valor_ipi: 0,
      cst_pis: null,
      valor_pis: 0,
      aliquota_pis: 0,
      cst_cofins: null,
      valor_cofins: 0,
      aliquota_cofins: 0,
      cst_cbs: str(cbs.CST_CBS ?? cbs.CST) || null,
      cst_ibs: str(ibs.CST_IBS ?? ibs.CST) || null,
      aliquota_cbs: num(cbs.pCBS),
      aliquota_ibs_estadual: num(ibs.pIBSEst),
      aliquota_ibs_municipal: num(ibs.pIBSMun),
      valor_cbs_ofertado: num(cbs.vCBS),
      valor_ibs_est_ofertado: num(ibs.vIBSEst),
      valor_ibs_mun_ofertado: num(ibs.vIBSMun),
      valor_credito_cbs: 0,
      valor_credito_ibs_est: 0,
      valor_credito_ibs_mun: 0,
      base_calculo_cbs: num(cbs.vBC),
      base_calculo_ibs: num(ibs.vBC),
      tipo_calculo_credito: "destacado" as const,
      aliquota_presumida_cbs: 0,
      aliquota_presumida_ibs: 0,
      natureza_operacao: "FRETE",
      gera_credito: false,
      motivo_vedacao_credito: null,
      classificado_por: null,
      regra_aplicada_id: null,
      status_item: "pendente" as const,
      observacao_credito: null,
    },
  ];

  const documento: ParsedDocumento["documento"] = {
    tipo: "CTe",
    chave_acesso: chave,
    numero_doc: str(ide.nCT) || null,
    serie: str(ide.serie) || null,
    data_emissao: dataEmissao || new Date().toISOString().substring(0, 10),
    data_entrada_saida: null,
    cnpj_emitente: str(emit.CNPJ),
    razao_emitente: str(emit.xNome) || null,
    cnpj_destinatario: str(dest.CNPJ ?? dest.CPF) || null,
    uf_emitente: str(emit.enderEmit?.UF) || null,
    uf_destinatario: str(dest.enderDest?.UF) || null,
    municipio_emitente: str(emit.enderEmit?.xMun) || null,
    municipio_destinatario: str(dest.enderDest?.xMun) || null,
    cfop_principal: str(ide.CFOP) || null,
    direcao,
    crt_emitente: (str(emit.CRT) as CRT) || null,
    tipo_credito_fornecedor: null,
    valor_total: valorTotal,
    valor_produtos: 0,
    valor_frete: valorTotal,
    valor_ipi: 0,
    valor_icms: itens[0].valor_icms,
    valor_pis: 0,
    valor_cofins: 0,
    valor_cbs_documento: itens[0].valor_cbs_ofertado,
    valor_ibs_documento: itens[0].valor_ibs_est_ofertado + itens[0].valor_ibs_mun_ofertado,
    xml_original: xmlString,
    status_classificacao: "pendente",
    periodo_competencia: periodoFromDate(dataEmissao),
  };

  return { documento, itens, raw_xml: xmlString };
}

// ============== NFS-e (ABRASF) ==============
function parseNFSe(parsed: any, xmlString: string): ParsedDocumento {
  const Nfse =
    getDeep<any>(parsed, ["ConsultarNfseResposta", "ListaNfse", "CompNfse", "Nfse"]) ??
    getDeep<any>(parsed, ["CompNfse", "Nfse"]) ??
    parsed.Nfse;

  const infNfse = Nfse?.InfNfse ?? Nfse?.infNfse ?? {};
  const servico = infNfse.Servico ?? {};
  const valores = servico.Valores ?? {};
  const prest = infNfse.PrestadorServico ?? {};
  const tom = infNfse.TomadorServico ?? {};

  const numero = str(infNfse.Numero);
  const dataEmissao = str(infNfse.DataEmissao).substring(0, 10);
  const valorServicos = num(valores.ValorServicos);

  const itens: ParsedDocumento["itens"] = [
    {
      numero_item: 1,
      codigo_produto: str(servico.ItemListaServico) || null,
      descricao: str(servico.Discriminacao) || "Serviço",
      ncm: null,
      cfop: null,
      unidade: null,
      quantidade: 1,
      valor_unitario: valorServicos,
      valor_total: valorServicos,
      cst_icms: null,
      valor_icms: 0,
      aliquota_icms: 0,
      cst_ipi: null,
      valor_ipi: 0,
      cst_pis: null,
      valor_pis: num(valores.ValorPis),
      aliquota_pis: 0,
      cst_cofins: null,
      valor_cofins: num(valores.ValorCofins),
      aliquota_cofins: 0,
      cst_cbs: null,
      cst_ibs: null,
      aliquota_cbs: 0,
      aliquota_ibs_estadual: 0,
      aliquota_ibs_municipal: 0,
      valor_cbs_ofertado: 0,
      valor_ibs_est_ofertado: 0,
      valor_ibs_mun_ofertado: 0,
      valor_credito_cbs: 0,
      valor_credito_ibs_est: 0,
      valor_credito_ibs_mun: 0,
      base_calculo_cbs: 0,
      base_calculo_ibs: 0,
      tipo_calculo_credito: "destacado" as const,
      aliquota_presumida_cbs: 0,
      aliquota_presumida_ibs: 0,
      natureza_operacao: "SERVICO",
      gera_credito: false,
      motivo_vedacao_credito: null,
      classificado_por: null,
      regra_aplicada_id: null,
      status_item: "pendente" as const,
      observacao_credito: null,
    },
  ];

  const documento: ParsedDocumento["documento"] = {
    tipo: "NFSe",
    chave_acesso: numero || `NFSE-${Date.now()}`,
    numero_doc: numero || null,
    serie: null,
    data_emissao: dataEmissao || new Date().toISOString().substring(0, 10),
    data_entrada_saida: null,
    cnpj_emitente: str(prest.IdentificacaoPrestador?.Cnpj),
    razao_emitente: str(prest.RazaoSocial) || null,
    cnpj_destinatario: str(tom.IdentificacaoTomador?.CpfCnpj?.Cnpj) || null,
    uf_emitente: str(prest.Endereco?.Uf) || null,
    uf_destinatario: str(tom.Endereco?.Uf) || null,
    municipio_emitente: null,
    municipio_destinatario: null,
    cfop_principal: null,
    direcao: "ENTRADA",
    crt_emitente: null,
    tipo_credito_fornecedor: null,
    valor_total: valorServicos,
    valor_produtos: 0,
    valor_frete: 0,
    valor_ipi: 0,
    valor_icms: 0,
    valor_pis: num(valores.ValorPis),
    valor_cofins: num(valores.ValorCofins),
    valor_cbs_documento: 0,
    valor_ibs_documento: 0,
    xml_original: xmlString,
    status_classificacao: "pendente",
    periodo_competencia: periodoFromDate(dataEmissao),
  };

  return { documento, itens, raw_xml: xmlString };
}
