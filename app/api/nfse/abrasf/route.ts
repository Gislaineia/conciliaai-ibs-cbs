/**
 * /api/nfse/abrasf
 * Conector ABRASF v2.04 - Padrao usado por ~80% dos municipios brasileiros
 * Metodos: ConsultarNfse, ConsultarNfsePorRps
 * Ref: ABRASF - Associacao Brasileira das Secretarias de Financas das Capitais
 *
 * POST body:
 * {
    *   empresa_id, cnpj, municipio_ibge, pfx_base64, pfx_senha,
    *   data_inicial, data_final, ambiente, pagina?
    * }
 */
import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import https from "https";
import { MUNICIPIOS_ABRASF } from "@/lib/abrasf-municipios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let _sb: any = null;
function supabase() {
  if (_sb) return _sb;
  _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  return _sb;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });

// ─── Carrega certificado A1 ───────────────────────────────────────────────
function carregarCertificado(pfxBase64: string, senha: string) {
    const pfx = forge.pkcs12.pkcs12FromAsn1(
          forge.asn1.fromDer(forge.util.decode64(pfxBase64)), senha
        );
    const certBag = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0];
    const keyBag  = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]![0];
    return {
          certPem: forge.pki.certificateToPem(certBag.cert!),
          keyPem:  forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey),
          cert:    certBag.cert!,
        };
  }

// ─── Assina XML com xml-crypto v6 (padrao ABRASF) ────────────────────────
function assinarXml(xml: string, keyPem: string, certPem: string): string {
    const x509 = certPem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\n/g, "");
    const sig = new SignedXml({
      privateKey: keyPem,
      canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
      signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
      getKeyInfoContent: () =>
        `<X509Data><X509Certificate>${x509}</X509Certificate></X509Data>`,
    } as any);
    sig.addReference({
      xpath: "//*[local-name()='ConsultarNfseEnvio']",
      transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature",
                                        "http://www.w3.org/2001/10/xml-exc-c14n#"],
      digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
        });
    sig.computeSignature(xml);
    return sig.getSignedXml();
  }

// ─── Monta XML ConsultarNfse (ABRASF 2.02/2.04) ──────────────────────────
function montarConsultarNfse(cnpj: string, dtInicio: string, dtFim: string, pagina = 1): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
  <ConsultarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
    <Prestador>
      <CpfCnpj><Cnpj>${cnpj}</Cnpj></CpfCnpj>
    </Prestador>
    <PeriodoEmissao>
      <DataInicial>${dtInicio}</DataInicial>
      <DataFinal>${dtFim}</DataFinal>
    </PeriodoEmissao>
    <Pagina>${pagina}</Pagina>
  </ConsultarNfseEnvio>`;
  }

// ─── Monta envelope SOAP ──────────────────────────────────────────────────
function montarSoap(xmlAssinado: string, versao = "2.02"): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                    xmlns:nfse="http://www.abrasf.org.br/nfse.xsd">
    <soapenv:Header/>
    <soapenv:Body>
      <nfse:ConsultarNfseEnvio versao="${versao}">
        <nfse:xmlEnvio><![CDATA[${xmlAssinado}]]></nfse:xmlEnvio>
      </nfse:ConsultarNfseEnvio>
    </soapenv:Body>
  </soapenv:Envelope>`;
  }

// ─── Chama WebService ABRASF ──────────────────────────────────────────────
async function consultarAbrasf(
    url: string, soap: string, certPem: string, keyPem: string
  ): Promise<string> {
    const agent = new https.Agent({
      cert: certPem,
      key: keyPem,
      rejectUnauthorized: false, // alguns municipios usam cert auto-assinado
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
    const res = await fetch(url.replace("?wsdl", ""), {
          method: "POST",
          headers: {
                  "Content-Type": "text/xml; charset=utf-8",
                  "SOAPAction": "ConsultarNfse",
                },
          body: soap,
          // @ts-ignore
          agent,
        });
    return res.text();
  }

// ─── Extrai NFS-e do retorno ABRASF ──────────────────────────────────────
function extrairNfse(xmlResp: string): { chave: string; xml: string; numero: string }[] {
    const parsed = parser.parse(xmlResp);
    const compNfse =
      parsed?.Envelope?.Body?.ConsultarNfseResposta?.ListaNfse?.CompNfse ??
      parsed?.Envelope?.Body?.ConsultarNfseResponse?.outputXML?.ListaNfse?.CompNfse ??
      [];

    const lista = Array.isArray(compNfse) ? compNfse : [compNfse];
    return lista.filter(Boolean).map((item: any) => {
          const infNfse = item?.Nfse?.InfNfse ?? item?.InfNfse ?? {};
          const numero  = String(infNfse?.Numero ?? infNfse?.["@_Id"] ?? Date.now());
          const chave   = infNfse?.CodigoVerificacao ?? numero;
          return { chave, numero, xml: JSON.stringify(item) };
        });
  }

// ─── Persiste no Supabase ─────────────────────────────────────────────────
async function salvar(empresaId: string, municipioIbge: string, docs: { chave: string; xml: string; numero: string }[]) {
    for (const d of docs) {
          await supabase().from("documentos_fiscais").upsert(
                  {
                            empresa_id:   empresaId,
                            chave_acesso: `ABRASF-${municipioIbge}-${d.chave}`,
                            xml:          d.xml,
                            schema:       "nfse",
                            nsu:          d.numero,
                            sim:          `abrasf_${municipioIbge}`,
                            importado_em: new Date().toISOString(),
                          },
                  { onConflict: "chave_acesso" }
                );
        }
  }

// ─── Handler principal ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
          const body = await req.json();
          const {
                  empresa_id,
                  cnpj,
                  municipio_ibge,
                  pfx_base64,
                  pfx_senha,
                  data_inicial,
                  data_final,
                  ambiente = "producao",
                  pagina   = 1,
                } = body;

          if (!cnpj || !municipio_ibge || !pfx_base64 || !pfx_senha || !data_inicial || !data_final) {
                  return NextResponse.json({
                            status: "erro",
                            mensagem: "Campos obrigatorios: cnpj, municipio_ibge, pfx_base64, pfx_senha, data_inicial, data_final",
                          }, { status: 400 });
                }

          // Valida municipio
          const municipio = MUNICIPIOS_ABRASF[municipio_ibge];
          if (!municipio) {
                  return NextResponse.json({
                            status: "erro",
                            mensagem: `Municipio ${municipio_ibge} nao mapeado. Consulte /api/nfse/abrasf/municipios para a lista completa.`,
                            municipios_disponiveis: Object.keys(MUNICIPIOS_ABRASF).length,
                          }, { status: 404 });
                }

          const { certPem, keyPem } = carregarCertificado(pfx_base64, pfx_senha);

          let totalCapturados = 0;
          let paginaAtual = pagina;
          let temMais = true;
          const erros: string[] = [];

          while (temMais) {
                  try {
                            const xmlConsulta  = montarConsultarNfse(cnpj, data_inicial, data_final, paginaAtual);
                            const xmlAssinado  = assinarXml(xmlConsulta, keyPem, certPem);
                            const soap         = montarSoap(xmlAssinado, municipio.versao);
                            const xmlResp      = await consultarAbrasf(municipio.url, soap, certPem, keyPem);
                            const docs         = extrairNfse(xmlResp);

                            if (docs.length === 0) { temMais = false; break; }

                            if (empresa_id) await salvar(empresa_id, municipio_ibge, docs);
                            totalCapturados += docs.length;
                            temMais = docs.length >= 50; // ABRASF retorna max 50 por pagina
                            paginaAtual++;
                          } catch (e: any) {
                            erros.push(e.message);
                            break;
                          }
                }

          return NextResponse.json({
                  status: "OK",
                  municipio: municipio.nome,
                  municipio_ibge,
                  total_capturados: totalCapturados,
                  paginas_consultadas: paginaAtual - pagina,
                  erros,
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
    return NextResponse.json({
          descricao: "Conector ABRASF v2.02/v2.04 - NFS-e municipais",
          municipios_mapeados: Object.keys(MUNICIPIOS_ABRASF).length,
          metodo: "POST",
          campos_obrigatorios: ["cnpj", "municipio_ibge", "pfx_base64", "pfx_senha", "data_inicial", "data_final"],
          exemplo: {
                  cnpj: "12345678000190",
                  municipio_ibge: "3106200",
                  pfx_base64: "base64_do_pfx",
                  pfx_senha: "senha",
                  data_inicial: "2026-01-01",
                  data_final: "2026-06-04",
                },
        });
  }
