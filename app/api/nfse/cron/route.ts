/**
 * /api/nfse/cron - Cron job NFS-e (a cada 4h via vercel.json)
 * Executa polling em paralelo:
 *   1. Portal Nacional RFB (municipios aderentes)
 *   2. ABRASF WebService (municipios com sistema proprio)
 */
import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { createClient } from "@supabase/supabase-js";
import https from "https";
import { MUNICIPIOS_ABRASF } from "../abrasf/route";
import { SignedXml } from "xml-crypto";
import { XMLParser } from "fast-xml-parser";

const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

const BASE_URL_RFB = {
      producao:    "https://nfse.receita.economia.gov.br/api/v1",
      homologacao: "https://hom.nfse.receita.economia.gov.br/api/v1",
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });

// ─── Helpers ─────────────────────────────────────────────────────────────
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

function assinarXml(xml: string, keyPem: string, certPem: string): string {
      const sig = new SignedXml({ privateKey: keyPem });
      sig.addReference({
              xpath: "//*[local-name()='ConsultarNfseEnvio']",
              transforms: [
                        "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
                        "http://www.w3.org/2001/10/xml-exc-c14n#",
                      ],
              digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
      });
      sig.signingKey = keyPem;
      sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";
      sig.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
      sig.keyInfoProvider = {
              getKeyInfo: () => `<X509Data><X509Certificate>${certPem
                                                                    .replace(/-----BEGIN CERTIFICATE-----/g, "")
                                                                    .replace(/-----END CERTIFICATE-----/g, "")
                                                                    .replace(/\n/g, "")}</X509Certificate></X509Data>`,
              getKey: () => Buffer.from(keyPem),
      } as any;
      sig.computeSignature(xml);
      return sig.getSignedXml();
}

// ─── Polling Portal Nacional RFB ─────────────────────────────────────────
async function pollPortalNacionalRFB(cfg: any): Promise<{ capturas: number; erros: string[] }> {
      const { certPem, keyPem } = carregarCertificado(cfg.pfx_base64, cfg.pfx_senha);
      const ambiente: "producao" | "homologacao" = cfg.ambiente ?? "homologacao";
      const base  = BASE_URL_RFB[ambiente];
      const agent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: true });
      const dataFim    = new Date().toISOString().split("T")[0];
      const dataInicio = cfg.nfse_data_inicio ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];
      let capturas = 0;
      const erros: string[] = [];
      let page = 1;
      let temMais = true;

  while (temMais) {
          try {
                    const url = `${base}/nfse/recebidas?cnpjTomador=${cfg.cnpj}&dataInicio=${dataInicio}&dataFim=${dataFim}&page=${page}`;
                    const res = await fetch(url, { headers: { Accept: "application/json" }, /* @ts-ignore */ agent });
                    if (!res.ok) { erros.push(`Portal RFB HTTP ${res.status}`); break; }
                    const data = await res.json();
                    const lista: any[] = data.nfse ?? data.data ?? [];
                    for (const nfse of lista) {
                                try {
                                              const chave = nfse.chaveNFSe ?? nfse.numeroNFSe ?? String(Date.now());
                                              await supabase.from("documentos_fiscais").upsert(
                                                  { empresa_id: cfg.empresa_id, chave_acesso: `RFB-${chave}`, xml: JSON.stringify(nfse),
                                                                 schema: "nfse", nsu: "", sim: "nfse_rfb_cron", importado_em: new Date().toISOString() },
                                                  { onConflict: "chave_acesso" }
                                                            );
                                              capturas++;
                                } catch (e: any) { erros.push(e.message); }
                    }
                    const totalPages = data.totalPages ?? 1;
                    temMais = page < totalPages && lista.length > 0;
                    page++;
          } catch (e: any) { erros.push(e.message); break; }
  }
      return { capturas, erros };
}

// ─── Polling ABRASF ───────────────────────────────────────────────────────
async function pollAbrasf(cfg: any, municipioIbge: string): Promise<{ capturas: number; erros: string[] }> {
      const municipio = MUNICIPIOS_ABRASF[municipioIbge];
      if (!municipio) return { capturas: 0, erros: [`Municipio ${municipioIbge} nao mapeado`] };

  const { certPem, keyPem } = carregarCertificado(cfg.pfx_base64, cfg.pfx_senha);
      const agent   = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false });
      const dataFim = new Date().toISOString().split("T")[0];
      const dataIni = cfg.nfse_data_inicio ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];
      let capturas  = 0;
      const erros: string[] = [];
      let pagina = 1;
      let temMais = true;

  while (temMais) {
          try {
                    const xmlEnvio   = `<?xml version="1.0" encoding="UTF-8"?><ConsultarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd"><Prestador><CpfCnpj><Cnpj>${cfg.cnpj}</Cnpj></CpfCnpj></Prestador><PeriodoEmissao><DataInicial>${dataIni}</DataInicial><DataFinal>${dataFim}</DataFinal></PeriodoEmissao><Pagina>${pagina}</Pagina></ConsultarNfseEnvio>`;
                    const xmlAssinado = assinarXml(xmlEnvio, keyPem, certPem);
                    const soap        = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="http://www.abrasf.org.br/nfse.xsd"><soapenv:Header/><soapenv:Body><nfse:ConsultarNfseEnvio versao="${municipio.versao}"><nfse:xmlEnvio><![CDATA[${xmlAssinado}]]></nfse:xmlEnvio></nfse:ConsultarNfseEnvio></soapenv:Body></soapenv:Envelope>`;
                    const res = await fetch(municipio.url.replace("?wsdl", ""), {
                                method: "POST",
                                headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "ConsultarNfse" },
                                body: soap,
                                // @ts-ignore
                                agent,
                    });
                    const xmlResp = await res.text();
                    const parsed  = parser.parse(xmlResp);
                    const compNfse =
                                parsed?.Envelope?.Body?.ConsultarNfseResposta?.ListaNfse?.CompNfse ??
                                parsed?.Envelope?.Body?.ConsultarNfseResponse?.outputXML?.ListaNfse?.CompNfse ?? [];
                    const lista = Array.isArray(compNfse) ? compNfse : compNfse ? [compNfse] : [];
                    if (lista.length === 0) { temMais = false; break; }
                    for (const item of lista) {
                                try {
                                              const infNfse = item?.Nfse?.InfNfse ?? item?.InfNfse ?? {};
                                              const numero  = String(infNfse?.Numero ?? Date.now());
                                              const chave   = infNfse?.CodigoVerificacao ?? numero;
                                              await supabase.from("documentos_fiscais").upsert(
                                                  { empresa_id: cfg.empresa_id, chave_acesso: `ABRASF-${municipioIbge}-${chave}`,
                                                                 xml: JSON.stringify(item), schema: "nfse", nsu: numero,
                                                                 sim: `abrasf_cron_${municipioIbge}`, importado_em: new Date().toISOString() },
                                                  { onConflict: "chave_acesso" }
                                                            );
                                              capturas++;
                                } catch (e: any) { erros.push(e.message); }
                    }
                    temMais = lista.length >= 50;
                    pagina++;
          } catch (e: any) { erros.push(e.message); break; }
  }
      return { capturas, erros };
}

// ─── Handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
              return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
      }

  // Busca empresas com nfse ativo
  const { data: configs, error } = await supabase
        .from("captura_sefaz_config")
        .select("*, empresa!inner(cnpj, uf, pfx_base64, pfx_senha, ambiente, cod_municipio_ibge)")
        .eq("nfse_ativo", true);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const resultado: Record<string, any> = {};

  for (const cfg of configs ?? []) {
          const empresa = (cfg as any).empresa;
          const base = {
                    empresa_id:       cfg.empresa_id,
                    cnpj:             empresa.cnpj,
                    pfx_base64:       empresa.pfx_base64,
                    pfx_senha:        empresa.pfx_senha,
                    ambiente:         empresa.ambiente ?? "homologacao",
                    nfse_data_inicio: (cfg as any).nfse_data_inicio,
          };
          const municipioIbge: string = empresa.cod_municipio_ibge ?? "";
          const rfbResult    = await pollPortalNacionalRFB(base);
          const abrasfResult = MUNICIPIOS_ABRASF[municipioIbge]
            ? await pollAbrasf(base, municipioIbge)
                    : { capturas: 0, erros: ["Municipio nao mapeado no ABRASF"] };

        resultado[empresa.cnpj] = {
                  portal_rfb: rfbResult,
                  abrasf:     abrasfResult,
                  municipio:  municipioIbge,
                  total:      rfbResult.capturas + abrasfResult.capturas,
        };

        // Atualiza status
        await supabase.from("captura_sefaz_config").update({
                  ultima_execucao: new Date().toISOString(),
                  ultimo_status:   "ok",
                  nfse_data_inicio: new Date().toISOString().split("T")[0],
        }).eq("empresa_id", cfg.empresa_id);
  }

  return NextResponse.json({ ok: true, resultado, executado_em: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
      return GET(req);
}
