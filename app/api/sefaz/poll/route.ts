import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import zlib from "zlib";
import { promisify } from "util";
import https from "https";

const gunzip = promisify(zlib.gunzip);h

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

function carregarCertificado(pfxBase64: string, senha: string) {
      const pfxDer = forge.util.decode64(pfxBase64);
      const pfxAsn1 = forge.asn1.fromDer(pfxDer);
      const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha);
      const certBag = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0];
      const keyBag = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]![0];
      return {
              certPem: forge.pki.certificateToPem(certBag.cert!),
              keyPem: forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey),
      };
}

async function consultarDFe(
      cnpj: string,
      uf: string,
      ultNSU: string,
      certPem: string,
      keyPem: string,
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

  const agent = new https.Agent({
        cert: certPem,
        key: keyPem,
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
      const res = await fetch(ENDPOINT_DFE[ambiente], {
              method: "POST",
              headers: { "Content-Type": "application/soap+xml; charset=utf-8", "SOAPAction": "" },
              body: soapEnvelope,
              // @ts-ignore
              agent,
      });
      return res.text();
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
              let {
                        empresa_id,
                        cnpj,
                        uf = "SP",
                        pfx_base64,
                        pfx_senha,
                        ult_nsu = "000000000000000",
                        ambiente = "homologacao",
              } = body;
.from("empresa")
                if (!cnpj) {
                                return NextResponse.json(
                                      { status: "erro", mensagem: "cnpj eh obrigatorio" },
                                      { status: 400 }
                                                );
                }
                    // Se cert nao veio no body, buscar do Supabase
                    if (!pfx_base64 || !pfx_senha) {
                                    if (empresa_id) {
                                                      const { data: cfgCert } = await supabase
                                                        .from("empresa")
                                                        .select("pfx_base64, pfx_senha")
                                                        .eq("empresa_id", empresa_id)
                                                        .maybeSingle();
                                                      if (cfgCert?.pfx_base64) pfx_base64 = cfgCert.pfx_base64;
                                                      if (cfgCert?.pfx_senha) pfx_senha = cfgCert.pfx_senha;
                                    }
                                    if (!pfx_base64 || !pfx_senha) {
                                                      return NextResponse.json(
                                                            { status: "erro", mensagem: "Certificado A1 nao encontrado. Carregue o .pfx em /captura-sefaz e salve a configuracao." },
                                                            { status: 400 }
                                                                        );
                                    }
                    }
            
        const { certPem, keyPem } = carregarCertificado(pfx_base64, pfx_senha);
              let ultNSU = ult_nsu;
              let temMais = true;
              let totalCap = 0;

        while (temMais) {
                  const xmlResp = await consultarDFe(cnpj, uf, ultNSU, certPem, keyPem, ambiente);
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
              return NextResponse.json(
                  { status: "erro", mensagem: (e as Error).message },
                  { status: 500 }
                      );
      }
}

export async function GET() {
      return NextResponse.json({ status: "OK", mensagem: "Use POST para disparar o poll" });
}
