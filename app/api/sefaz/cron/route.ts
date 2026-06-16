import { NextRequest, NextResponse } from "next/server";
import tls from "tls";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import zlib from "zlib";
import { promisify } from "util";
import https from "https";

const gunzip = promisify(zlib.gunzip);
const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

// Mapa UF -> cUFAutor (IBGE)
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

// Valida o PFX usando OpenSSL nativo (suporta algoritmos modernos ICP-Brasil).
function carregarCertificado(pfxBase64: string, senha: string): Buffer {
  const pfxBuf = Buffer.from(pfxBase64, "base64");
  // Lanca se a senha estiver incorreta ou o PFX for invalido.
  tls.createSecureContext({ pfx: pfxBuf, passphrase: senha });
  return pfxBuf;
}

async function pollEmpresa(cfg: any): Promise<{ capturas: number; erros: string[] }> {
      const pfxBuf = carregarCertificado(cfg.pfx_base64, cfg.pfx_senha);
      const ambiente: "producao" | "homologacao" = cfg.ambiente ?? "homologacao";
      const cUFAutor = UF_COD[cfg.uf?.toUpperCase()] ?? "35";
      let ultNSU: string = cfg.ult_nsu ?? "000000000000000";
      let temMais = true;
      let capturas = 0;
      const erros: string[] = [];
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  while (temMais) {
          const agent = new https.Agent({
            pfx: pfxBuf,
            passphrase: cfg.pfx_senha,
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
          const soap = `<?xml version="1.0" encoding="UTF-8"?>
          <soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
            <soap12:Body>
                <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
                      <nfeDadosMsg>
                              <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
                                        <tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb>
                                                  <cUFAutor>${cUFAutor}</cUFAutor>
                                                            <CNPJ>${cfg.cnpj}</CNPJ>
                                                                      <distNSU><ultNSU>${ultNSU.padStart(15, "0")}</ultNSU></distNSU>
                                                                              </distDFeInt>
                                                                                    </nfeDadosMsg>
                                                                                        </nfeDistDFeInteresse>
                                                                                          </soap12:Body>
                                                                                          </soap12:Envelope>`;

        try {
                  const res = await fetch(ENDPOINT_DFE[ambiente], {
                              method: "POST",
                              headers: {
                                            "Content-Type": "application/soap+xml; charset=utf-8",
                                            "SOAPAction": "",
                              },
                              body: soap,
                              // @ts-ignore
                              agent,
                  });

            const xmlResp = await res.text();
                  const parsed = parser.parse(xmlResp);
                  const retDist =
                              parsed?.["soap12:Envelope"]?.["soap12:Body"]
                      ?.["nfeDistDFeInteresseResponse"]?.["nfeDistDFeInteresseResult"]
                      ?.["retDistDFeInt"];

            const cStat = retDist?.cStat;
                  const maxNSU: string = retDist?.dhResp ? retDist.maxNSU?.toString() ?? ultNSU : ultNSU;
                  const loteDistDFeInt = retDist?.loteDistDFeInt;

            if (cStat !== "138" && cStat !== "137") {
                        erros.push(`cStat=${cStat} xMotivo=${retDist?.xMotivo}`);
                        break;
            }

            const docs = Array.isArray(loteDistDFeInt?.docZip)
                    ? loteDistDFeInt.docZip
                        : loteDistDFeInt?.docZip
                    ? [loteDistDFeInt.docZip]
                        : [];

            for (const doc of docs) {
                        try {
                                      const buf = await gunzip(Buffer.from(doc["#text"] ?? doc, "base64"));
                                      const xml = buf.toString("utf-8");
                                      const chave = xml.match(/ch(?:NFe|CTe)[^>]*>([^<]{44})/)?.[1] ?? maxNSU;
                                      await supabase.from("documentos_fiscais").upsert(
                                          { empresa_id: cfg.empresa_id, chave_acesso: chave, xml, schema: (xml.includes("cteProc") || xml.includes("<CTe")) ? "cteProc" : "nfeProc", nsu: maxNSU },
                                          { onConflict: "chave_acesso" }
                                                    );
                                      capturas++;
                        } catch (e: any) { erros.push(e.message); }
            }

            temMais = ultNSU !== maxNSU && (Array.isArray(docs) ? docs.length > 0 : false);
                  ultNSU = maxNSU;
        } catch (e: any) {
                  erros.push(e.message);
                  break;
        }
  }

  // Atualiza NSU e timestamp na config
  await supabase
        .from("captura_sefaz_config")
        .update({ ult_nsu: ultNSU, ultima_execucao: new Date().toISOString(), ultimo_status: erros.length ? "erro" : "ok", ultimo_erro: erros[0] ?? null })
        .eq("empresa_id", cfg.empresa_id);

  return { capturas, erros };
}

export async function POST(req: NextRequest) {
      // Valida CRON_SECRET
  const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
              return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
      }

  // Busca todas as empresas com polling ativo + JOIN empresa para pegar cnpj, uf, pfx
  const { data: configs, error } = await supabase
        .from("captura_sefaz_config")
        .select("*, empresa!inner(cnpj, uf, pfx_base64, pfx_senha, ambiente)")
        .eq("polling_ativo", true);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const resultado: Record<string, any> = {};
      for (const cfg of configs ?? []) {
              const empresa = (cfg as any).empresa;
              resultado[empresa.cnpj] = await pollEmpresa({
                        empresa_id: cfg.empresa_id,
                        cnpj: empresa.cnpj,
                        uf: empresa.uf,
                        pfx_base64: empresa.pfx_base64,
                        pfx_senha: empresa.pfx_senha,
                        ambiente: empresa.ambiente ?? cfg.ambiente ?? "homologacao",
                        ult_nsu: (cfg as any).ult_nsu ?? "000000000000000",
              });
      }

  return NextResponse.json({ ok: true, resultado, executado_em: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
      // Vercel cron chama via GET com header authorization
  const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
              return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
      }
      return POST(req);
}
