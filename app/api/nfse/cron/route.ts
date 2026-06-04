import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { createClient } from "@supabase/supabase-js";
import https from "https";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const BASE_URL = {
    producao: "https://nfse.receita.economia.gov.br/api/v1",
    homologacao: "https://hom.nfse.receita.economia.gov.br/api/v1",
  };

function carregarCertificado(pfxBase64: string, senha: string) {
    const pfx = forge.pkcs12.pkcs12FromAsn1(
          forge.asn1.fromDer(forge.util.decode64(pfxBase64)), senha
        );
    const certBag = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0];
    const keyBag = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]![0];
    return {
          certPem: forge.pki.certificateToPem(certBag.cert!),
          keyPem: forge.pki.privateKeyToPem(keyBag.key as forge.pki.rsa.PrivateKey),
        };
  }

async function pollNfseEmpresa(cfg: any): Promise<{ capturas: number; erros: string[] }> {
    const { certPem, keyPem } = carregarCertificado(cfg.pfx_base64, cfg.pfx_senha);
    const ambiente: "producao" | "homologacao" = cfg.ambiente ?? "homologacao";
    const base = BASE_URL[ambiente];
    const agent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: true });

    // Janela: ultimas 24h se nao houver data salva
    const dataFim = new Date().toISOString().split("T")[0];
    const dataInicio = cfg.nfse_data_inicio ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

    let capturas = 0;
    const erros: string[] = [];
    let page = 1;
    let temMais = true;

    while (temMais) {
          try {
                  const url = `${base}/nfse/recebidas?cnpjTomador=${cfg.cnpj}&dataInicio=${dataInicio}&dataFim=${dataFim}&page=${page}`;
                  const res = await fetch(url, {
                            headers: { Accept: "application/json" },
                            // @ts-ignore
                            agent,
                          });

                  if (!res.ok) {
                            erros.push(`HTTP ${res.status} - ${await res.text()}`);
                            break;
                          }

                  const data = await res.json();
                  const lista: any[] = data.nfse ?? data.data ?? [];

                  for (const nfse of lista) {
                            try {
                                        const chave = nfse.chaveNFSe ?? nfse.numeroNFSe ?? String(Date.now());
                                        const xml = JSON.stringify(nfse);
                                        await supabase.from("documentos_fiscais").upsert(
                                                      {
                                                                      empresa_id: cfg.empresa_id,
                                                                      chave_acesso: chave,
                                                                      xml,
                                                                      schema: "nfse",
                                                                      nsu: "",
                                                                      sim: "nfse_nacional_cron",
                                                                      importado_em: new Date().toISOString(),
                                                                    },
                                                      { onConflict: "chave_acesso" }
                                                    );
                                        capturas++;
                                      } catch (e: any) { erros.push(e.message); }
                          }

                  // Paginacao
                  const totalPages = data.totalPages ?? data.total_pages ?? 1;
                  temMais = page < totalPages && lista.length > 0;
                  page++;
                } catch (e: any) {
                  erros.push(e.message);
                  break;
                }
        }

    // Atualiza data inicio para proxima execucao (dia seguinte)
    await supabase
      .from("captura_sefaz_config")
      .update({
              ultima_execucao: new Date().toISOString(),
              ultimo_status: erros.length ? "erro" : "ok",
              ultimo_erro: erros[0] ?? null,
            })
      .eq("empresa_id", cfg.empresa_id);

    return { capturas, erros };
  }

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
          return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
        }

    // Busca empresas com nfse_ativo = true e certificado configurado
    const { data: configs, error } = await supabase
      .from("captura_sefaz_config")
      .select("*, empresa!inner(cnpj, uf, pfx_base64, pfx_senha, ambiente)")
      .eq("nfse_ativo", true);

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    const resultado: Record<string, any> = {};
    for (const cfg of configs ?? []) {
          const empresa = (cfg as any).empresa;
          resultado[empresa.cnpj] = await pollNfseEmpresa({
                  empresa_id: cfg.empresa_id,
                  cnpj: empresa.cnpj,
                  pfx_base64: empresa.pfx_base64,
                  pfx_senha: empresa.pfx_senha,
                  ambiente: empresa.ambiente ?? "homologacao",
                  nfse_data_inicio: (cfg as any).nfse_data_inicio,
                });
        }

    return NextResponse.json({ ok: true, resultado, executado_em: new Date().toISOString() });
  }

export async function POST(req: NextRequest) {
    return GET(req);
  }
