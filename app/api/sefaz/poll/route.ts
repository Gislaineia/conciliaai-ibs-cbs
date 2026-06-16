import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import zlib from "zlib";
import { promisify } from "util";
import https from "https";
import tls from "tls";

const gunzip = promisify(zlib.gunzip);

const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

// Mapa UF -> cUFAutor (codigo IBGE)
const UF_COD: Record<string, string> = {
      AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
      ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
      PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
      RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

const ENDPOINT_DFE = {
      producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
      homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

// Valida o PFX usando OpenSSL nativo (suporta todos os algoritmos modernos ICP-Brasil).
// Mais robusto que node-forge para PFX com SHA-256 MAC ou PBES2/AES.
function validarPfx(pfxBase64: string, senha: string): Buffer {
  const pfxBuf = Buffer.from(pfxBase64, "base64");
  try {
    tls.createSecureContext({ pfx: pfxBuf, passphrase: senha });
  } catch (e: any) {
    throw new Error(`Senha incorreta ou certificado inválido: ${e.message}`);
  }
  return pfxBuf;
}

// httpsPost usa node:https diretamente — fetch nativo do Node 18+ não suporta o parâmetro agent
// necessário para mTLS (certificado A1 como client certificate)
function httpsPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  agent: https.Agent
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyBuf = Buffer.from(body, "utf-8");
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port || "443"),
        path: parsed.pathname + (parsed.search ?? ""),
        method: "POST",
        agent,
        headers: { ...headers, "Content-Length": bodyBuf.length },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

async function consultarDFe(
      cnpj: string,
      uf: string,
      ultNSU: string,
      pfxBuf: Buffer,
      pfxSenha: string,
      ambiente: "producao" | "homologacao"
    ): Promise<string> {
      const tpAmb = ambiente === "producao" ? "1" : "2";
      const nsuPad = ultNSU.padStart(15, "0");
      const cUFAutor = UF_COD[uf?.toUpperCase()] ?? "35";

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <CNPJ>${cnpj}</CNPJ>
          <distNSU><ultNSU>${nsuPad}</ultNSU></distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;

  // Usa pfx+passphrase via OpenSSL (mais robusto que node-forge para certs ICP-Brasil modernos)
  const agent = new https.Agent({
    pfx: pfxBuf,
    passphrase: pfxSenha,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    ciphers: [
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-RSA-AES256-SHA384",
      "ECDHE-RSA-AES128-SHA256",
      "AES256-GCM-SHA384",
      "AES128-GCM-SHA256",
    ].join(":"),
  });

  return httpsPost(
    ENDPOINT_DFE[ambiente],
    soapEnvelope,
    { "Content-Type": "application/soap+xml; charset=utf-8", SOAPAction: "" },
    agent
  );
}

async function processarRetorno(
      xmlResp: string,
      empresaId: string
    ): Promise<{ documentos: { chave: string; schema: string; nsu: string; xml: string }[]; ultNSU: string; maxNSU: string; temMais: boolean }> {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const parsed = parser.parse(xmlResp);
      const retDist =
              parsed?.["soap12:Envelope"]?.["soap12:Body"]
          ?.["nfeDistDFeInteresseResponse"]?.["nfeDistDFeInteresseResult"]
          ?.["retDistDFeInt"];

  const maxNSU: string = retDist?.maxNSU?.toString() ?? "0";
      const ultNSU: string = retDist?.ultNSU?.toString() ?? "0";
      const lote = retDist?.loteDistDFeInt;
      const rawDocs = Array.isArray(lote?.docZip) ? lote.docZip : lote?.docZip ? [lote.docZip] : [];

  const documentos: { chave: string; schema: string; nsu: string; xml: string }[] = [];
      for (const doc of rawDocs) {
              try {
                        const buf = await gunzip(Buffer.from(doc["#text"] ?? doc, "base64"));
                        const xml = buf.toString("utf-8");
                        // Detecta NF-e (chNFe) ou CT-e (chCTe) ou evento
                        const chave =
                          xml.match(/chNFe[^>]*>([^<]{44})/)?.[1] ??
                          xml.match(/chCTe[^>]*>([^<]{44})/)?.[1] ??
                          xml.match(/Id="(?:NFe|CTe)([0-9]{44})"/)?.[1] ??
                          maxNSU;
                        const schema = xml.includes("cteProc") || xml.includes("<CTe")
                          ? "cteProc"
                          : xml.includes("procEventoNFe") || xml.includes("procEventoCTe")
                          ? "evento"
                          : xml.includes("resNFe") || xml.includes("resCTe")
                          ? "resumo"
                          : xml.includes("nfeProc") || xml.includes("<NFe")
                          ? "nfeProc"
                          : "desconhecido";
                        const docNSU = String(doc?.["@_NSU"] ?? maxNSU);
                        documentos.push({ chave, schema, nsu: docNSU, xml });
              } catch {}
      }

  return { documentos, ultNSU, maxNSU, temMais: ultNSU !== maxNSU && rawDocs.length > 0 };
}

async function salvarNoSupabase(
      empresaId: string,
      documentos: { chave: string; schema: string; nsu: string; xml: string }[]
    ) {
      for (const d of documentos) {
              await supabase.from("documentos_fiscais").upsert(
                  {
                              empresa_id: empresaId,
                              chave_acesso: d.chave,
                              xml: d.xml,
                              schema: d.schema,
                              nsu: d.nsu,
                              sim: "sefaz_poll",
                              importado_em: new Date().toISOString(),
                  },
                  { onConflict: "chave_acesso" }
                      );
      }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { empresa_id, cnpj, uf = "SP", pfx_base64, pfx_senha, ult_nsu = "000000000000000", ambiente = "homologacao" } = body;

    if (!cnpj) {
      return NextResponse.json({ status: "erro", mensagem: "cnpj eh obrigatorio" }, { status: 400 });
    }

    // Fallback: busca cert do Supabase se não veio no body
    if (!pfx_base64) {
      if (empresa_id) {
        const { data: cfg } = await supabase
          .from("captura_sefaz_config")
          .select("pfx_base64, pfx_senha")
          .eq("empresa_id", empresa_id)
          .maybeSingle();
        if (cfg?.pfx_base64) pfx_base64 = cfg.pfx_base64;
        if (cfg?.pfx_senha) pfx_senha = cfg.pfx_senha;
      }
      if (!pfx_base64) {
        return NextResponse.json(
          { status: "erro", mensagem: "Certificado A1 nao encontrado. Carregue o .pfx em /captura-sefaz e salve a configuracao." },
          { status: 400 }
        );
      }
    }

    // Valida o PFX via OpenSSL (não usa node-forge — suporta todos os algoritmos ICP-Brasil)
    let pfxBuf: Buffer;
    try {
      pfxBuf = validarPfx(pfx_base64, pfx_senha);
    } catch (e: any) {
      return NextResponse.json(
        { status: "erro", mensagem: `Certificado A1 invalido: ${e.message}. Verifique se a senha está correta e recarregue o .pfx em /captura-sefaz.` },
        { status: 400 }
      );
    }

    let ultNSU = ult_nsu;
    let temMais = true;
    let totalCap = 0;

    while (temMais) {
      const xmlResp = await consultarDFe(cnpj, uf, ultNSU, pfxBuf, pfx_senha, ambiente);
      const { documentos, maxNSU, temMais: continua } = await processarRetorno(xmlResp, empresa_id);
      if (empresa_id) await salvarNoSupabase(empresa_id, documentos);
      totalCap += documentos.length;
      temMais = continua;
      ultNSU = maxNSU;
      if (!continua) break;
    }

    return NextResponse.json({
      status: "OK",
      total: totalCap,
      ult_nsu: ultNSU,
      max_nsu: ultNSU,
      tem_mais: false,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ status: "erro", mensagem: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
      return NextResponse.json({ status: "OK", mensagem: "Use POST para disparar o poll" });
}
import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import zlib from "zlib";
import { promisify } from "util";
import https from "https";
import tls from "tls";

const gunzip = promisify(zlib.gunzip);

const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

// Mapa UF -> cUFAutor (codigo IBGE)
const UF_COD: Record<string, string> = {
      AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
      ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
      PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
      RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

const ENDPOINT_DFE = {
      producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
      homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

// Valida o PFX usando OpenSSL nativo (suporta todos os algoritmos modernos ICP-Brasil).
// Mais robusto que node-forge para PFX com SHA-256 MAC ou PBES2/AES.
function validarPfx(pfxBase64: string, senha: string): Buffer {
  const pfxBuf = Buffer.from(pfxBase64, "base64");
  try {
    tls.createSecureContext({ pfx: pfxBuf, passphrase: senha });
  } catch (e: any) {
    throw new Error(`Senha incorreta ou certificado inválido: ${e.message}`);
  }
  return pfxBuf;
}

// httpsPost usa node:https diretamente — fetch nativo do Node 18+ não suporta o parâmetro agent
// necessário para mTLS (certificado A1 como client certificate)
function httpsPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  agent: https.Agent
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyBuf = Buffer.from(body, "utf-8");
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port || "443"),
        path: parsed.pathname + (parsed.search ?? ""),
        method: "POST",
        agent,
        headers: { ...headers, "Content-Length": bodyBuf.length },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

async function consultarDFe(
      cnpj: string,
      uf: string,
      ultNSU: string,
      pfxBuf: Buffer,
      pfxSenha: string,
      ambiente: "producao" | "homologacao"
    ): Promise<string> {
      const tpAmb = ambiente === "producao" ? "1" : "2";
      const nsuPad = ultNSU.padStart(15, "0");
      const cUFAutor = UF_COD[uf?.toUpperCase()] ?? "35";

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <CNPJ>${cnpj}</CNPJ>
          <distNSU><ultNSU>${nsuPad}</ultNSU></distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;

  // Usa pfx+passphrase via OpenSSL (mais robusto que node-forge para certs ICP-Brasil modernos)
  const agent = new https.Agent({
    pfx: pfxBuf,
    passphrase: pfxSenha,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    ciphers: [
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-RSA-AES256-SHA384",
      "ECDHE-RSA-AES128-SHA256",
      "AES256-GCM-SHA384",
      "AES128-GCM-SHA256",
    ].join(":"),
  });

  return httpsPost(
    ENDPOINT_DFE[ambiente],
    soapEnvelope,
    { "Content-Type": "application/soap+xml; charset=utf-8", SOAPAction: "" },
    agent
  );
}

async function processarRetorno(
      xmlResp: string,
      empresaId: string
    ): Promise<{ documentos: { chave: string; schema: string; nsu: string; xml: string }[]; ultNSU: string; maxNSU: string; temMais: boolean }> {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const parsed = parser.parse(xmlResp);
      const retDist =
              parsed?.["soap12:Envelope"]?.["soap12:Body"]
          ?.["nfeDistDFeInteresseResponse"]?.["nfeDistDFeInteresseResult"]
          ?.["retDistDFeInt"];

  const maxNSU: string = retDist?.maxNSU?.toString() ?? "0";
      const ultNSU: string = retDist?.ultNSU?.toString() ?? "0";
      const lote = retDist?.loteDistDFeInt;
      const rawDocs = Array.isArray(lote?.docZip) ? lote.docZip : lote?.docZip ? [lote.docZip] : [];

  const documentos: { chave: string; schema: string; nsu: string; xml: string }[] = [];
      for (const doc of rawDocs) {
              try {
                        const buf = await gunzip(Buffer.from(doc["#text"] ?? doc, "base64"));
                        const xml = buf.toString("utf-8");
                        // Detecta NF-e (chNFe) ou CT-e (chCTe) ou evento
                        const chave =
                          xml.match(/chNFe[^>]*>([^<]{44})/)?.[1] ??
                          xml.match(/chCTe[^>]*>([^<]{44})/)?.[1] ??
                          xml.match(/Id="(?:NFe|CTe)([0-9]{44})"/)?.[1] ??
                          maxNSU;
                        const schema = xml.includes("cteProc") || xml.includes("<CTe")
                          ? "cteProc"
                          : xml.includes("procEventoNFe") || xml.includes("procEventoCTe")
                          ? "evento"
                          : xml.includes("resNFe") || xml.includes("resCTe")
                          ? "resumo"
                          : xml.includes("nfeProc") || xml.includes("<NFe")
                          ? "nfeProc"
                          : "desconhecido";
                        const docNSU = String(doc?.["@_NSU"] ?? maxNSU);
                        documentos.push({ chave, schema, nsu: docNSU, xml });
              } catch {}
      }

  return { documentos, ultNSU, maxNSU, temMais: ultNSU !== maxNSU && rawDocs.length > 0 };
}

async function salvarNoSupabase(
      empresaId: string,
      documentos: { chave: string; schema: string; nsu: string; xml: string }[]
    ) {
      for (const d of documentos) {
              await supabase.from("documentos_fiscais").upsert(
                  {
                              empresa_id: empresaId,
                              chave_acesso: d.chave,
                              xml: d.xml,
                              schema: d.schema,
                              nsu: d.nsu,
                              sim: "sefaz_poll",
                              importado_em: new Date().toISOString(),
                  },
                  { onConflict: "chave_acesso" }
                      );
      }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { empresa_id, cnpj, uf = "SP", pfx_base64, pfx_senha, ult_nsu = "000000000000000", ambiente = "homologacao" } = body;

    if (!cnpj) {
      return NextResponse.json({ status: "erro", mensagem: "cnpj eh obrigatorio" }, { status: 400 });
    }

    // Fallback: busca cert do Supabase se não veio no body
    if (!pfx_base64) {
      if (empresa_id) {
        const { data: cfg } = await supabase
          .from("captura_sefaz_config")
          .select("pfx_base64, pfx_senha")
          .eq("empresa_id", empresa_id)
          .maybeSingle();
        if (cfg?.pfx_base64) pfx_base64 = cfg.pfx_base64;
        if (cfg?.pfx_senha) pfx_senha = cfg.pfx_senha;
      }
      if (!pfx_base64) {
        return NextResponse.json(
          { status: "erro", mensagem: "Certificado A1 nao encontrado. Carregue o .pfx em /captura-sefaz e salve a configuracao." },
          { status: 400 }
        );
      }
    }

    // Valida o PFX via OpenSSL (não usa node-forge — suporta todos os algoritmos ICP-Brasil)
    let pfxBuf: Buffer;
    try {
      pfxBuf = validarPfx(pfx_base64, pfx_senha);
    } catch (e: any) {
      return NextResponse.json(
        { status: "erro", mensagem: `Certificado A1 invalido: ${e.message}. Verifique se a senha está correta e recarregue o .pfx em /captura-sefaz.` },
        { status: 400 }
      );
    }

    let ultNSU = ult_nsu;
    let temMais = true;
    let totalCap = 0;

    while (temMais) {
      const xmlResp = await consultarDFe(cnpj, uf, ultNSU, pfxBuf, pfx_senha, ambiente);
      const { documentos, maxNSU, temMais: continua } = await processarRetorno(xmlResp, empresa_id);
      if (empresa_id) await salvarNoSupabase(empresa_id, documentos);
      totalCap += documentos.length;
      temMais = continua;
      ultNSU = maxNSU;
      if (!continua) break;
    }

    return NextResponse.json({
      status: "OK",
      total: totalCap,
      ult_nsu: ultNSU,
      max_nsu: ultNSU,
      tem_mais: false,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ status: "erro", mensagem: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
      return NextResponse.json({ status: "OK", mensagem: "Use POST para disparar o poll" });
}
import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import zlib from "zlib";
import { promisify } from "util";
import https from "https";
import tls from "tls";

const gunzip = promisify(zlib.gunzip);

const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

// Mapa UF -> cUFAutor (codigo IBGE)
const UF_COD: Record<string, string> = {
      AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
      ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
      PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
      RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
};

const ENDPOINT_DFE = {
      producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
      homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

// Valida o PFX usando OpenSSL nativo (suporta todos os algoritmos modernos ICP-Brasil).
// Mais robusto que node-forge para PFX com SHA-256 MAC ou PBES2/AES.
function validarPfx(pfxBase64: string, senha: string): Buffer {
  const pfxBuf = Buffer.from(pfxBase64, "base64");
  try {
    tls.createSecureContext({ pfx: pfxBuf, passphrase: senha });
  } catch (e: any) {
    throw new Error(`Senha incorreta ou certificado inválido: ${e.message}`);
  }
  return pfxBuf;
}

// httpsPost usa node:https diretamente — fetch nativo do Node 18+ não suporta o parâmetro agent
// necessário para mTLS (certificado A1 como client certificate)
function httpsPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  agent: https.Agent
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyBuf = Buffer.from(body, "utf-8");
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port || "443"),
        path: parsed.pathname + (parsed.search ?? ""),
        method: "POST",
        agent,
        headers: { ...headers, "Content-Length": bodyBuf.length },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      }
    );
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

async function consultarDFe(
      cnpj: string,
      uf: string,
      ultNSU: string,
      pfxBuf: Buffer,
      pfxSenha: string,
      ambiente: "producao" | "homologacao"
    ): Promise<string> {
      const tpAmb = ambiente === "producao" ? "1" : "2";
      const nsuPad = ultNSU.padStart(15, "0");
      const cUFAutor = UF_COD[uf?.toUpperCase()] ?? "35";

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <CNPJ>${cnpj}</CNPJ>
          <distNSU><ultNSU>${nsuPad}</ultNSU></distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;

  // Usa pfx+passphrase via OpenSSL (mais robusto que node-forge para certs ICP-Brasil modernos)
  const agent = new https.Agent({
    pfx: pfxBuf,
    passphrase: pfxSenha,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    ciphers: [
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-RSA-AES256-SHA384",
      "ECDHE-RSA-AES128-SHA256",
      "AES256-GCM-SHA384",
      "AES128-GCM-SHA256",
    ].join(":"),
  });

  return httpsPost(
    ENDPOINT_DFE[ambiente],
    soapEnvelope,
    { "Content-Type": "application/soap+xml; charset=utf-8", SOAPAction: "" },
    agent
  );
}

async function processarRetorno(
      xmlResp: string,
      empresaId: string
    ): Promise<{ documentos: { chave: string; schema: string; nsu: string; xml: string }[]; ultNSU: string; maxNSU: string; temMais: boolean }> {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const parsed = parser.parse(xmlResp);
      const retDist =
              parsed?.["soap12:Envelope"]?.["soap12:Body"]
          ?.["nfeDistDFeInteresseResponse"]?.["nfeDistDFeInteresseResult"]
          ?.["retDistDFeInt"];

  const maxNSU: string = retDist?.maxNSU?.toString() ?? "0";
      const ultNSU: string = retDist?.ultNSU?.toString() ?? "0";
      const lote = retDist?.loteDistDFeInt;
      const rawDocs = Array.isArray(lote?.docZip) ? lote.docZip : lote?.docZip ? [lote.docZip] : [];

  const documentos: { chave: string; schema: string; nsu: string; xml: string }[] = [];
      for (const doc of rawDocs) {
              try {
                        const buf = await gunzip(Buffer.from(doc["#text"] ?? doc, "base64"));
                        const xml = buf.toString("utf-8");
                        // Detecta NF-e (chNFe) ou CT-e (chCTe) ou evento
                        const chave =
                          xml.match(/chNFe[^>]*>([^<]{44})/)?.[1] ??
                          xml.match(/chCTe[^>]*>([^<]{44})/)?.[1] ??
                          xml.match(/Id="(?:NFe|CTe)([0-9]{44})"/)?.[1] ??
                          maxNSU;
                        const schema = xml.includes("cteProc") || xml.includes("<CTe")
                          ? "cteProc"
                          : xml.includes("procEventoNFe") || xml.includes("procEventoCTe")
                          ? "evento"
                          : xml.includes("resNFe") || xml.includes("resCTe")
                          ? "resumo"
                          : xml.includes("nfeProc") || xml.includes("<NFe")
                          ? "nfeProc"
                          : "desconhecido";
                        documentos.push({ chave, schema, nsu: maxNSU, xml });
              } catch {}
      }

  return { documentos, ultNSU, maxNSU, temMais: ultNSU !== maxNSU && rawDocs.length > 0 };
}

async function salvarNoSupabase(
      empresaId: string,
      documentos: { chave: string; schema: string; nsu: string; xml: string }[]
    ) {
      for (const d of documentos) {
              await supabase.from("documentos_fiscais").upsert(
                  {
                              empresa_id: empresaId,
                              chave_acesso: d.chave,
                              xml: d.xml,
                              schema: d.schema,
                              nsu: d.nsu,
                              sim: "sefaz_poll",
                              importado_em: new Date().toISOString(),
                  },
                  { onConflict: "chave_acesso" }
                      );
      }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { empresa_id, cnpj, uf = "SP", pfx_base64, pfx_senha, ult_nsu = "000000000000000", ambiente = "homologacao" } = body;

    if (!cnpj) {
      return NextResponse.json({ status: "erro", mensagem: "cnpj eh obrigatorio" }, { status: 400 });
    }

    // Fallback: busca cert do Supabase se não veio no body
    if (!pfx_base64 || !pfx_senha) {
      if (empresa_id) {
        const { data: cfg } = await supabase
          .from("captura_sefaz_config")
          .select("pfx_base64, pfx_senha")
          .eq("empresa_id", empresa_id)
          .maybeSingle();
        if (cfg?.pfx_base64) pfx_base64 = cfg.pfx_base64;
        if (cfg?.pfx_senha) pfx_senha = cfg.pfx_senha;
      }
      if (!pfx_base64 || !pfx_senha) {
        return NextResponse.json(
          { status: "erro", mensagem: "Certificado A1 nao encontrado. Carregue o .pfx em /captura-sefaz e salve a configuracao." },
          { status: 400 }
        );
      }
    }

    // Valida o PFX via OpenSSL (não usa node-forge — suporta todos os algoritmos ICP-Brasil)
    let pfxBuf: Buffer;
    try {
      pfxBuf = validarPfx(pfx_base64, pfx_senha);
    } catch (e: any) {
      return NextResponse.json(
        { status: "erro", mensagem: `Certificado A1 invalido: ${e.message}. Verifique se a senha está correta e recarregue o .pfx em /captura-sefaz.` },
        { status: 400 }
      );
    }

    let ultNSU = ult_nsu;
    let temMais = true;
    let totalCap = 0;

    while (temMais) {
      const xmlResp = await consultarDFe(cnpj, uf, ultNSU, pfxBuf, pfx_senha, ambiente);
      const { documentos, maxNSU, temMais: continua } = await processarRetorno(xmlResp, empresa_id);
      if (empresa_id) await salvarNoSupabase(empresa_id, documentos);
      totalCap += documentos.length;
      temMais = continua;
      ultNSU = maxNSU;
      if (!continua) break;
    }

    return NextResponse.json({
      status: "OK",
      total: totalCap,
      ult_nsu: ultNSU,
      max_nsu: ultNSU,
      tem_mais: false,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ status: "erro", mensagem: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
      return NextResponse.json({ status: "OK", mensagem: "Use POST para disparar o poll" });
}
