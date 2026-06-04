import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import zlib from "zlib";
import { promisify } from "util";
import https from "https";

const gunzip  = promisify(zlib.gunzip);
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ENDPOINT_DFE = {
  producao:    "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

function carregarCertificado(pfxBase64: string, senha: string) {
    const pfx = forge.pkcs12.pkcs12FromAsn1(
    forge.asn1.fromDer(forge.util.decode64(pfxBase64)), senha
  );
  const certBag = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0];
  const keyBag  = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]![0];
    return {
    certPem: forge.pki.certificateToPem(certBag.cert!),
    keyPem:  forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey),
  };
}

async function pollEmpresa(emp: any): Promise<{ capturados: number; erros: string[] }> {
  const { certPem, keyPem } = carregarCertificado(emp.pfx_base64, emp.pfx_senha);
    const ambiente = emp.ambiente ?? "homologacao";
    let ultNSU     = emp.ult_nsu ?? "000000000000000";
    let temMais    = true;
    let capturados = 0;
  const erros: string[] = [];
  const parser   = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  while (temMais) {
    const agent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: true });
        const soap  = `<?xml version="1.0" encoding="UTF-8"?>
    <soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
      <soap12:Body>
        <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
          <nfeDadosMsg>
            <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
    <tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb>
              <cUFAutor>35</cUFAutor>
    <CNPJ>${emp.cnpj}</CNPJ>
    <distNSU><ultNSU>${ultNSU.padStart(15, "0")}</ultNSU></distNSU>
            </distDFeInt>
          </nfeDadosMsg>
        </nfeDistDFeInteresse>
      </soap12:Body>
    </soap12:Envelope>`;

    const res = await fetch(ENDPOINT_DFE[ambiente as keyof typeof ENDPOINT_DFE], {
              method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8", SOAPAction: "" },
              body: soap,
              // @ts-ignore
              agent,
        });

    if (!res.ok) { erros.push(`HTTP ${res.status}`); break; }

    const retorno = parser.parse(await res.text())
    ?.["soap:Envelope"]?.["soap:Body"]
          ?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt;

    if (!retorno) break;

    const maxNSU = String(retorno.maxNSU ?? ultNSU);
    ultNSU       = String(retorno.ultNSU ?? ultNSU);
        const raw    = retorno.loteDistDFeInt?.docZip;

    if (raw) {
      const docs = Array.isArray(raw) ? raw : [raw];
      for (const doc of docs) {
                  try {
            const b64  = typeof doc === "string" ? doc : doc["#text"] ?? "";
            const nsu  = typeof doc === "string" ? "" : String(doc["@_NSU"] ?? "");
            const buf  = Buffer.from(b64, "base64");
                      let xml    = "";
            try { xml = (await gunzip(buf)).toString("utf-8"); }
            catch { xml = buf.toString("utf-8"); }

            const chave = xml.match(/chNFe[^>]*>([^<]{44})/)?.[1] ?? nsu;
            await supabase.from("documentos_fiscais").upsert(
              { empresa_id: emp.empresa_id, chave_acesso: chave, xml, schema: "nfeProc", nsu, origem: "sefaz_cron", importado_em: new Date().toISOString() },
              { onConflict: "chave_acesso" }
            );
                      capturados++;
            } catch (e: any) { erros.push(e.message); }
        }
      }

      temMais = ultNSU !== maxNSU && (raw ? (Array.isArray(raw) ? raw.length : 1) > 0 : false);
    }

      // Atualiza NSU e timestamp no banco
    await supabase.from("empresas_sefaz_config")
    .update({ ult_nsu: ultNSU, ultima_execucao: new Date().toISOString() })
    .eq("empresa_id", emp.empresa_id);

    return { capturados, erros };
  }

  // ─── GET: chamado pelo Vercel Cron ou agendador externo ──────────────────
  export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
    }

    const { data: empresas, error } = await supabase
    .from("empresas_sefaz_config")
    .select("*")
    .eq("polling_ativo", true);

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    const resultado: Record<string, any> = {};
    for (const emp of empresas ?? []) {
        resultado[emp.cnpj] = await pollEmpresa(emp);
      }

      return NextResponse.json({ ok: true, resultado, executado_em: new Date().toISOString() });
    }
