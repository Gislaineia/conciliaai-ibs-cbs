import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { createClient } from "@supabase/supabase-js";
import https from "https";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const BASE_URL = {
    producao:    "https://nfse.receita.economia.gov.br/api/v1",
    homologacao: "https://hom.nfse.receita.economia.gov.br/api/v1",
  };

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

export async function POST(req: NextRequest) {
    try {
          const body = await req.json();
          const {
                  empresa_id,
                  cnpj,
                  pfx_base64,
                  pfx_senha,
                  data_inicio,
                  data_fim,
                  ambiente = "homologacao",
                } = body;

          if (!cnpj || !pfx_base64 || !pfx_senha || !data_inicio || !data_fim) {
                  return NextResponse.json(
                            { status: "erro", mensagem: "cnpj, pfx_base64, pfx_senha, data_inicio e data_fim sao obrigatorios" },
                            { status: 400 }
                          );
                }

          const { certPem, keyPem } = carregarCertificado(pfx_base64, pfx_senha);
          const base  = BASE_URL[ambiente as keyof typeof BASE_URL];
          const agent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: true });

          // Consulta lista de NFS-e recebidas
          const listUrl = `${base}/nfse/recebidas?cnpjTomador=${cnpj}&dataInicio=${data_inicio}&dataFim=${data_fim}&pagina=1`;
          const listRes = await fetch(listUrl, {
                  headers: { Accept: "application/json" },
                  // @ts-ignore
                  agent,
                });

          if (!listRes.ok) {
                  const txt = await listRes.text();
                  throw new Error(`NFS-e Nacional HTTP ${listRes.status}: ${txt}`);
                }

          const lista = await listRes.json();
          const nfses: any[] = lista?.nfse ?? lista?.dados ?? [];
          const salvos: string[] = [];

          for (const nfse of nfses) {
                  const chave = nfse.chaveAcesso ?? nfse.numero ?? String(Math.random());

                  // Baixa o XML de cada NFS-e
                  const xmlUrl = `${base}/nfse/${chave}/xml`;
                  const xmlRes = await fetch(xmlUrl, {
                            headers: { Accept: "application/xml" },
                            // @ts-ignore
                            agent,
                          });

                  if (!xmlRes.ok) continue;
                  const xml = await xmlRes.text();

                  await supabase.from("documentos_fiscais").upsert(
                            {
                                        empresa_id:   empresa_id ?? cnpj,
                                        chave_acesso: chave,
                                        xml,
                                        schema:       "nfse",
                                        nsu:          "",
                                        origem:       "nfse_nacional_poll",
                                        importado_em: new Date().toISOString(),
                                      },
                            { onConflict: "chave_acesso" }
                          );
                  salvos.push(chave);
                }

          return NextResponse.json({
                  status:    "OK",
                  total:     salvos.length,
                  chaves:    salvos,
                  timestamp: new Date().toISOString(),
                });
        } catch (e) {
          return NextResponse.json(
                  { status: "erro", mensagem: String((e as Error).message) },
                  { status: 500 }
                );
        }
  }

export async function GET() {
    return NextResponse.json({ status: "OK", mensagem: "Use POST para buscar NFS-e do Portal Nacional RFB." });
  }
