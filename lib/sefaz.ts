/**
 * lib/sefaz.ts
 *
 * Helpers compartilhados para integração com SEFAZ / DF-e / NFS-e:
 *  - carregamento de certificado A1 (PFX/P12) via node-forge
 *  - mapas de UF -> código IBGE (cUF / cUFAutor)
 *  - mapa de UF -> SEFAZ autorizadora (servico) com endpoints WS
 *  - cliente SOAP minimalista usando https.Agent + mTLS
 *
 * IMPORTANT: Esses módulos só rodam no servidor (next.config.js já marca
 *            node-forge / xml-crypto como serverComponentsExternalPackages).
 */
import https from "https";

// ────────────────────────────────────────────────────────────────────────────
// Mapa UF → código IBGE (cUF / cUFAutor)
// ────────────────────────────────────────────────────────────────────────────
export const UF_COD: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
  PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
  RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

export const COD_UF: Record<string, string> = Object.fromEntries(
  Object.entries(UF_COD).map(([uf, cod]) => [cod, uf])
);

// ────────────────────────────────────────────────────────────────────────────
// Endpoint nacional DF-e (NFeDistribuicaoDFe) — Ambiente Nacional
// ────────────────────────────────────────────────────────────────────────────
export const ENDPOINT_DFE = {
  producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

// ────────────────────────────────────────────────────────────────────────────
// Mapa UF → SEFAZ autorizadora (algumas UFs usam SVRS/SVAN/SVCAN/SVCRS).
// Este mapa cobre os endpoints "NfeConsultaProtocolo4" e "NfeStatusServico4"
// usados nas consultas síncronas. Pode evoluir conforme NTs SEFAZ.
// ────────────────────────────────────────────────────────────────────────────
type WsUf = { producao: string; homologacao: string };
type SefazUf = { consulta: WsUf; status: WsUf };

const SVRS: SefazUf = {
  consulta: {
    producao: "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
    homologacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
  },
  status: {
    producao: "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
    homologacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  },
};

const SVAN: SefazUf = {
  consulta: {
    producao: "https://www.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
    homologacao: "https://hom.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
  },
  status: {
    producao: "https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx",
    homologacao: "https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx",
  },
};

const SP: SefazUf = {
  consulta: {
    producao: "https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
    homologacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
  },
  status: {
    producao: "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
    homologacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
  },
};

const RS: SefazUf = SVRS; // RS usa SVRS

const MG: SefazUf = {
  consulta: {
    producao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4",
    homologacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4",
  },
  status: {
    producao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
    homologacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
  },
};

const PR: SefazUf = {
  consulta: {
    producao: "https://nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4",
    homologacao: "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4",
  },
  status: {
    producao: "https://nfe.sefa.pr.gov.br/nfe/NFeStatusServico4",
    homologacao: "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeStatusServico4",
  },
};

const BA: SefazUf = {
  consulta: {
    producao: "https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
    homologacao: "https://hnfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx",
  },
  status: {
    producao: "https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
    homologacao: "https://hnfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
  },
};

const GO: SefazUf = {
  consulta: {
    producao: "https://nfe.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4",
    homologacao: "https://homolog.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4",
  },
  status: {
    producao: "https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4",
    homologacao: "https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4",
  },
};

const MT: SefazUf = {
  consulta: {
    producao: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4",
    homologacao: "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4",
  },
  status: {
    producao: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4",
    homologacao: "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4",
  },
};

const MS: SefazUf = {
  consulta: {
    producao: "https://nfe.fazenda.ms.gov.br/producao/services2/NFeConsultaProtocolo4",
    homologacao: "https://hom.nfe.sefaz.ms.gov.br/homologacao/services2/NFeConsultaProtocolo4",
  },
  status: {
    producao: "https://nfe.fazenda.ms.gov.br/producao/services2/NFeStatusServico4",
    homologacao: "https://hom.nfe.sefaz.ms.gov.br/homologacao/services2/NFeStatusServico4",
  },
};

const PE: SefazUf = {
  consulta: {
    producao: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4",
    homologacao: "https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4",
  },
  status: {
    producao: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4",
    homologacao: "https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4",
  },
};

// Demais UFs caem em SVRS (Sefaz Virtual RS) que atende a maioria
export const SEFAZ_AUTORIZADORA: Record<string, SefazUf> = {
  AC: SVRS, AL: SVRS, AP: SVRS, AM: SVRS, BA, CE: SVRS, DF: SVRS,
  ES: SVRS, GO, MA: SVAN, MT, MS, MG, PA: SVRS, PB: SVRS, PR,
  PE, PI: SVRS, RJ: SVRS, RN: SVRS, RS, RO: SVRS, RR: SVRS,
  SC: SVRS, SP, SE: SVRS, TO: SVRS,
};

// ────────────────────────────────────────────────────────────────────────────
// Carrega certificado A1 (PFX/P12) e devolve PEMs para uso em https.Agent.
// Lê dinamicamente node-forge (server-only).
// ────────────────────────────────────────────────────────────────────────────
export async function carregarCertificadoA1(
  pfxBase64: string,
  senha: string
): Promise<{ certPem: string; keyPem: string; subject: string; notAfter: Date }> {
  const forge = (await import("node-forge")).default ?? (await import("node-forge"));
  const pfxDer = forge.util.decode64(pfxBase64);
  const pfxAsn1 = forge.asn1.fromDer(pfxDer);
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha);
  const certBag = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  const keyBag = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
    forge.pki.oids.pkcs8ShroudedKeyBag
  ]?.[0];
  if (!certBag?.cert || !keyBag?.key) {
    throw new Error("Certificado A1 inválido: bag cert/key ausente. Confira PFX e senha.");
  }
  const cert = certBag.cert;
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keyBag.key as any),
    subject: cert.subject.attributes
      .map((a: any) => `${a.shortName || a.name}=${a.value}`)
      .join(", "),
    notAfter: cert.validity.notAfter,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Cliente SOAP mínimo com mTLS
//
// Importante: SEFAZ/RFB exigem TLS 1.2+ e ciphers especificos. Por padrao
// passamos minVersion='TLSv1.2' e ciphers HIGH para evitar handshakes
// rejeitados por algoritmos legados.
// ────────────────────────────────────────────────────────────────────────────
export async function soapPost(
  url: string,
  body: string,
  certPem: string,
  keyPem: string,
  opts?: {
    soapAction?: string;
    contentType?: string;
    rejectUnauthorized?: boolean;
    minTlsVersion?: "TLSv1.2" | "TLSv1.3";
  }
): Promise<string> {
  const agent = new https.Agent({
    cert: certPem,
    key: keyPem,
    rejectUnauthorized: opts?.rejectUnauthorized ?? true,
    minVersion: (opts?.minTlsVersion ?? "TLSv1.2") as any,
    // Ciphers compativeis com SEFAZ/RFB (evita falhas de cipher mismatch)
    ciphers: [
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-RSA-AES256-SHA384",
      "ECDHE-RSA-AES128-SHA256",
      "AES256-GCM-SHA384",
      "AES128-GCM-SHA256",
      "AES256-SHA256",
      "AES128-SHA256",
    ].join(":"),
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": opts?.contentType ?? "application/soap+xml; charset=utf-8",
      ...(opts?.soapAction ? { SOAPAction: opts.soapAction } : {}),
    },
    body,
    // @ts-ignore — Node fetch aceita agent
    agent,
  });
  return res.text();
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers de extração rápida em respostas SEFAZ
// ────────────────────────────────────────────────────────────────────────────
export function extrairValor(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  return xml.match(re)?.[1]?.trim() ?? null;
}

export function ufFromChave(chave44: string): string | null {
  if (!chave44 || chave44.length < 2) return null;
  return COD_UF[chave44.substring(0, 2)] ?? null;
}
