import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import zlib from "zlib";
import { promisify } from "util";
import https from "https";

const gunzip = promisify(zlib.gunzip);

// ─── Supabase ─────────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// ─── Endpoints SEFAZ por ambiente ─────────────────────────────────────────
const ENDPOINT_DFE = {
    producao:    "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

// ─── Carrega certificado A1 (.pfx) ────────────────────────────────────────
function carregarCertificado(pfxBase64: string, senha: string) {
    const pfxDer  = forge.util.decode64(pfxBase64);
    const pfxAsn1 = forge.asn1.fromDer(pfxDer);
    const pfx     = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha);

  const certBag = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0];
    const keyBag  = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]![0];

  return {
        certPem: forge.pki.certificateToPem(certBag.cert!),
        keyPem:  forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey),
  };
}

// ─── Monta e envia envelope SOAP para DF-e ────────────────────────────────
async function consultarDFe(
    cnpj: string,
    ultNSU: string,
    certPem: string,
    keyPem: string,
    ambiente: "producao" | "homologacao"
  ): Promise<string> {
    const tpAmb  = ambiente === "producao" ? "1" : "2";
    const nsuPad = ultNSU.padStart(15, "0");

  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
  <soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
      xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
        <soap12:Body>
            <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
                  <nfeDadosMsg>
                          <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
                                    <tpAmb>${tpAmb}</tpAmb>
                                              <cUFAutor>35</cUFAutor>
                                                        <CNPJ>${cnpj}</CNPJ>
                                                                  <distNSU><ultNSU>${nsuPad}</ultNSU></distNSU>
                                                                          </distDFeInt>
                                                                                </nfeDadosMsg>
                                                                                    </nfeDistDFeInteresse>
                                                                                      </soap12:Body>
                                                                                      </soap12:Envelope>`;

  const agent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: true });
    const url   = ENDPOINT_DFE[ambiente];

  const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8", SOAPAction: "" },
        body: soapEnvelope,
        // @ts-ignore
        agent,
  });

  if (!res.ok) throw new Error(`SEFAZ HTTP ${res.status}: ${await res.text()}`);
    return res.text();
}

// ─── Parseia resposta SOAP e extrai XMLs ──────────────────────────────────
async function parsearResposta(soap: string) {
    const parser  = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed  = parser.parse(soap);
    const retorno = parsed?.["soap:Envelope"]?.["soap:Body"]
      ?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt;

  if (!retorno) throw new Error("Resposta SEFAZ inválida ou sem retDistDFeInt");

  const ultNSU = String(retorno.ultNSU ?? "000000000000000");
    const maxNSU = String(retorno.maxNSU ?? ultNSU);
    const raw    = retorno.loteDistDFeInt?.docZip;
    if (!raw) return { documentos: [], ultNSU, maxNSU };

  const docs = Array.isArray(raw) ? raw : [raw];
    const documentos: { chave: string; schema: string; nsu: string; xml: string }[] = [];

  for (const doc of docs) {
        const b64    = typeof doc === "string" ? doc : doc["#text"] ?? "";
        const schema = typeof doc === "string" ? "" : doc["@_schema"] ?? "";
        const nsu    = typeof doc === "string" ? "" : String(doc["@_NSU"] ?? "");

      let xml = "";
        try {
                const buf = Buffer.from(b64, "base64");
                xml = (await gunzip(buf)).toString("utf-8");
        } catch {
                xml = Buffer.from(b64, "base64").toString("utf-8");
        }

      const chave = xml.match(/chNFe[^>]*>([^<]{44})/)?.[1] ?? nsu;
        documentos.push({ chave, schema, nsu, xml });
  }

  return { documentos, ultNSU, maxNSU };
}

// ─── Persiste no Supabase ─────────────────────────────────────────────────
async function salvarNoSupabase(
    empresaId: string,
    docs: { chave: string; schema: string; nsu: string; xml: string }[]
  ) {
    for (const d of docs) {
          await supabase.from("documentos_fiscais").upsert(
            {
                      empresa_id:   empresaId,
                      chave_acesso: d.chave,
                      xml:          d.xml,
                      schema:       d.schema,
                      nsu:          d.nsu,
                      origem:       "sefaz_poll",
                      importado_em: new Date().toISOString(),
            },
            { onConflict: "chave_acesso" }
                );
    }
}

// ─── POST handler ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
          const body = await req.json();
          const {
                  empresa_id,
                  cnpj,
                  pfx_base64,
                  pfx_senha,
                  ult_nsu     = "000000000000000",
                  ambiente    = "homologacao",
          } = body;

      if (!cnpj || !pfx_base64 || !pfx_senha) {
              return NextResponse.json(
                { status: "erro", mensagem: "cnpj, pfx_base64 e pfx_senha são obrigatórios" },
                { status: 400 }
                      );
      }

      const { certPem, keyPem } = carregarCertificado(pfx_base64, pfx_senha);
          const soap = await consultarDFe(cnpj, ult_nsu, certPem, keyPem, ambiente);
          const { documentos, ultNSU, maxNSU } = await parsearResposta(soap);

      if (empresa_id && documentos.length > 0) {
              await salvarNoSupabase(empresa_id, documentos);
      }

      return NextResponse.json({
              status:           "OK",
              total_capturados: documentos.length,
              chaves:           documentos.map((d) => d.chave),
              ult_nsu:          ultNSU,
              max_nsu:          maxNSU,
              tem_mais:         ultNSU !== maxNSU,
              timestamp:        new Date().toISOString(),
      });
    } catch (e) {
          return NextResponse.json(
            { status: "erro", mensagem: String((e as Error).message) },
            { status: 500 }
                );
    }
}

export async function GET() {
    return NextResponse.json({ status: "OK", mensagem: "Use POST para disparar o polling." });
}
