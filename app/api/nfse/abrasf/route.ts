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

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });

// ─── Mapa codigo IBGE -> URL WebService ABRASF ────────────────────────────
// Fonte: repositorio publico das prefeituras + ABRASF
export const MUNICIPIOS_ABRASF: Record<string, { nome: string; url: string; versao: string }> = {
    // Minas Gerais
    "3106200": { nome: "Belo Horizonte", url: "https://bhissweb.pbh.gov.br/bhiss-ws/nfse?wsdl", versao: "2.02" },
    "3170206": { nome: "Uberlandia",     url: "https://nfse.uberlandia.mg.gov.br/publica/ws/nfse.wsdl", versao: "2.02" },
    "3118601": { nome: "Contagem",       url: "https://nfse.contagem.mg.gov.br/nfse-ws/NfseWS?wsdl", versao: "2.02" },
    "3149309": { nome: "Juiz de Fora",   url: "https://nfe.juizdefora.mg.gov.br/nfse/ws/nfse.wsdl", versao: "2.02" },
    // Parana
    "4106902": { nome: "Curitiba",       url: "https://tributario.curitiba.pr.gov.br/nfse/WS/NFSeWS.asmx?wsdl", versao: "2.02" },
    "4113700": { nome: "Londrina",       url: "https://nfse.londrina.pr.gov.br/nfse-ws/nfse.wsdl", versao: "2.02" },
    "4115200": { nome: "Maringa",        url: "https://nfse.maringa.pr.gov.br/ws/nfse.wsdl", versao: "2.02" },
    "4119905": { nome: "Ponta Grossa",   url: "https://nfse.pontagrossa.pr.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Santa Catarina
    "4205407": { nome: "Florianopolis",  url: "https://nfse.pmf.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
    "4202404": { nome: "Blumenau",       url: "https://nfse.blumenau.sc.gov.br/NFSe.asmx?wsdl", versao: "2.02" },
    "4209102": { nome: "Joinville",      url: "https://nfse.joinville.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
    "4214805": { nome: "Sao Jose",       url: "https://nfse.saojose.sc.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Rio Grande do Sul
    "4314902": { nome: "Porto Alegre",   url: "https://nfse.portoalegre.rs.gov.br/smarapd/ws/nfse.wsdl", versao: "2.02" },
    "4304606": { nome: "Caxias do Sul",  url: "https://nfse.caxias.rs.gov.br/ws/nfse.wsdl", versao: "2.02" },
    "4316907": { nome: "Santa Maria",    url: "https://nfse.santamaria.rs.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Goias
    "5208707": { nome: "Goiania",        url: "https://nfse.goiania.go.gov.br/ws/nfse.wsdl", versao: "2.02" },
    "5201405": { nome: "Anapolis",       url: "https://nfse.anapolis.go.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Mato Grosso do Sul
    "5002704": { nome: "Campo Grande",   url: "https://nfse.campogrande.ms.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Bahia
    "2927408": { nome: "Salvador",       url: "https://nfse.salvador.ba.gov.br/ws/lotenfe.asmx?wsdl", versao: "2.02" },
    // Pernambuco
    "2611606": { nome: "Recife",         url: "https://nfse.recife.pe.gov.br/NFSEserv/services/NFSEserv?wsdl", versao: "2.02" },
    // Ceara
    "2304400": { nome: "Fortaleza",      url: "https://nfse.fortaleza.ce.gov.br/NFSEService/services/NFSEService?wsdl", versao: "2.02" },
    // Amazonas
    "1302603": { nome: "Manaus",         url: "https://nfse.manaus.am.gov.br/WSNFSe/services/NFSe?wsdl", versao: "2.02" },
    // Para
    "1501402": { nome: "Belem",          url: "https://nfse.belem.pa.gov.br/nfse-web/ws/NFSeSOAP?wsdl", versao: "2.02" },
    // Maranhao
    "2111300": { nome: "Sao Luis",       url: "https://nfse.saoluis.ma.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Mato Grosso
    "5103403": { nome: "Cuiaba",         url: "https://nfse.cuiaba.mt.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Espirito Santo
    "3205309": { nome: "Vitoria",        url: "https://nfse.vitoria.es.gov.br/ws/nfse.wsdl", versao: "2.02" },
    "3201308": { nome: "Cariacica",      url: "https://nfse.cariacica.es.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Rondonia
    "1100205": { nome: "Porto Velho",    url: "https://nfse.portovelho.ro.gov.br/ws/nfse.wsdl", versao: "2.02" },
    // Tocantins
    "1721000": { nome: "Palmas",         url: "https://nfse.palmas.to.gov.br/ws/nfse.wsdl", versao: "2.02" },
  };

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

// ─── Assina XML com xml-crypto (padrao ABRASF) ────────────────────────────
function assinarXml(xml: string, keyPem: string, certPem: string): string {
    const sig = new SignedXml({ privateKey: keyPem });
    sig.addReference({
          xpath: "//*[local-name()='ConsultarNfseEnvio']",
          transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature",
                                        "http://www.w3.org/2001/10/xml-exc-c14n#"],
          digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
        });
    sig.signingKey    = keyPem;
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
    const agent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false });
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
          await supabase.from("documentos_fiscais").upsert(
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
