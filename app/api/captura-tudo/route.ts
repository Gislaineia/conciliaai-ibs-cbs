/**
 * /api/captura-tudo
 *
 * Orquestrador de captura automatica unificada:
 *   1. SEFAZ DF-e (NFeDistribuicaoDFe)  -> NF-e + CT-e + eventos + resumos
 *   2. NFS-e Portal Nacional RFB         -> NFS-e de todos municipios aderentes
 *   3. NFS-e ABRASF (lista de municipios) -> Osasco, Barueri, Sao Paulo, etc.
 *
 * Tudo em paralelo (Promise.allSettled). Cada falha eh isolada e nao
 * afeta as outras. Resposta agrega: total, sucessos, erros e tempo.
 *
 * Body:
 *   {
 *     empresa_id: string,
 *     ambiente?: "producao" | "homologacao",
 *     data_inicial?: "YYYY-MM-DD" (default: 30 dias atras),
 *     data_final?: "YYYY-MM-DD" (default: hoje),
 *     municipios_abrasf?: string[] (codigos IBGE para varrer; default = sede da empresa),
 *     incluir_sefaz?: boolean (default true),
 *     incluir_nfse_rfb?: boolean (default true),
 *     incluir_abrasf?: boolean (default true)
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MUNICIPIOS_ABRASF } from "@/lib/abrasf-municipios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

let _sb: any = null;
function supabase() {
  if (_sb) return _sb;
  _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  return _sb;
}

interface Resultado {
  fonte: string;
  status: "OK" | "ERRO" | "SKIP";
  total?: number;
  detalhes?: string;
  duracao_ms: number;
  payload?: any;
}

export async function POST(req: NextRequest) {
  const inicioTotal = Date.now();
  try {
    const body = await req.json();
    const {
      empresa_id,
      ambiente = "producao",
      municipios_abrasf,
      incluir_sefaz = true,
      incluir_nfse_rfb = true,
      incluir_abrasf = true,
    } = body;
    let { data_inicial, data_final } = body;
    // Aceita dados da empresa direto no body (caso nao esteja persistida no Supabase)
    let cnpj: string | undefined = body.cnpj;
    let pfx_base64: string | undefined = body.pfx_base64;
    let pfx_senha: string | undefined = body.pfx_senha;
    let codigo_municipio_ibge: string | undefined = body.codigo_municipio_ibge;
            let uf: string | undefined = body.uf;

    // Datas default: ultimos 30 dias
    const hoje = new Date().toISOString().substring(0, 10);
    data_final = data_final ?? hoje;
    data_inicial =
      data_inicial ??
      new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);

    // Tenta carregar empresa do Supabase (best-effort)
    if (empresa_id) {
      try {
        const { data: emp } = await supabase()
          .from("empresa")
          .select("id, cnpj, uf, pfx_base64, pfx_senha, ambiente, codigo_municipio_ibge")
          .eq("id", empresa_id)
          .maybeSingle();
        if (emp) {
          cnpj = cnpj ?? emp.cnpj;            uf = uf ?? emp.uf;
          pfx_base64 = pfx_base64 ?? emp.pfx_base64;
          pfx_senha = pfx_senha ?? emp.pfx_senha;
          codigo_municipio_ibge =
            codigo_municipio_ibge ?? emp.codigo_municipio_ibge;
        }
      } catch {
        /* ignora — empresa pode nao estar no Supabase, usa dados do body */
      }
    }

    if (!cnpj || !pfx_base64 || !pfx_senha) {
      return NextResponse.json(
        {
          status: "erro",
          mensagem:
            "Faltam dados da empresa. Envie cnpj, pfx_base64 e pfx_senha no body, ou cadastre a empresa no Supabase.",
          dica: "Em /captura-sefaz, carregue o .pfx e clique 'Salvar configuracao' para persistir no Supabase.",
        },
        { status: 400 }
      );
    }

    const cnpjLimpo = String(cnpj).replace(/\D/g, "");
    const ambienteEfetivo = ambiente ?? "producao";

    // Defaults de municipios ABRASF: sede da empresa + comuns
    const municipiosVarrer: string[] =
      municipios_abrasf && municipios_abrasf.length > 0
        ? municipios_abrasf
        : Array.from(
            new Set(
              [
                codigo_municipio_ibge,
                "3534401", // Osasco
                "3505708", // Barueri
                "3550308", // Sao Paulo capital
              ].filter(Boolean)
            )
          );

    // Helpers para chamar endpoints internos
    const baseUrl =
      req.nextUrl.origin || `https://${req.headers.get("host")}`;

    async function chamarEndpoint(
      path: string,
      payload: any
    ): Promise<{ status: number; data: any }> {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }

    // ── Tarefas em paralelo ──────────────────────────────────────────────
    const tarefas: Promise<Resultado>[] = [];

    if (incluir_sefaz) {
      tarefas.push(
        (async () => {
          const t0 = Date.now();
          try {
            const { status, data } = await chamarEndpoint("/api/sefaz/poll", {
              empresa_id,
              cnpj: cnpjLimpo,
              pfx_base64: pfx_base64,
              pfx_senha: pfx_senha,
              ambiente: ambienteEfetivo,
                          uf: uf ?? "SP",
            });
            return {
              fonte: "SEFAZ DF-e (NF-e + CT-e)",
              status: status === 200 && data?.status !== "erro" ? "OK" : "ERRO",
              total: data?.total ?? data?.documentos?.length ?? 0,
              detalhes: data?.mensagem ?? data?.ult_nsu ? `NSU ${data.ult_nsu}` : "",
              duracao_ms: Date.now() - t0,
              payload: data,
            } as Resultado;
          } catch (e: any) {
            return {
              fonte: "SEFAZ DF-e (NF-e + CT-e)",
              status: "ERRO",
              detalhes: e.message,
              duracao_ms: Date.now() - t0,
            };
          }
        })()
      );
    }

    if (incluir_nfse_rfb) {
      tarefas.push(
        (async () => {
          const t0 = Date.now();
          try {
            const { status, data } = await chamarEndpoint("/api/nfse/poll", {
              empresa_id,
              cnpj: cnpjLimpo,
              pfx_base64: pfx_base64,
              pfx_senha: pfx_senha,
              data_inicio: data_inicial,
              data_fim: data_final,
              ambiente: ambienteEfetivo,
            });
            return {
              fonte: "NFS-e Portal Nacional (RFB)",
              status: status === 200 && data?.status === "OK" ? "OK" : "ERRO",
              total: data?.total ?? 0,
              detalhes: data?.mensagem ?? data?.url_consultada ?? "",
              duracao_ms: Date.now() - t0,
              payload: data,
            } as Resultado;
          } catch (e: any) {
            return {
              fonte: "NFS-e Portal Nacional (RFB)",
              status: "ERRO",
              detalhes: e.message,
              duracao_ms: Date.now() - t0,
            };
          }
        })()
      );
    }

    if (incluir_abrasf) {
      for (const ibge of municipiosVarrer) {
        const mun = MUNICIPIOS_ABRASF[ibge];
        if (!mun) continue;
        const ehSP = ibge === "3550308";
        const path = ehSP ? "/api/nfse/sp" : "/api/nfse/abrasf";
        tarefas.push(
          (async () => {
            const t0 = Date.now();
            try {
              const { status, data } = await chamarEndpoint(path, {
                empresa_id,
                cnpj: cnpjLimpo,
                pfx_base64: pfx_base64,
                pfx_senha: pfx_senha,
                municipio_ibge: ibge,
                data_inicial,
                data_final,
                ambiente: ambienteEfetivo,
              });
              return {
                fonte: `${mun.nome} (${mun.versao})`,
                status: status === 200 && data?.status === "OK" ? "OK" : "ERRO",
                total: data?.total_capturados ?? 0,
                detalhes: data?.mensagem ?? "",
                duracao_ms: Date.now() - t0,
                payload: data,
              } as Resultado;
            } catch (e: any) {
              return {
                fonte: mun.nome,
                status: "ERRO",
                detalhes: e.message,
                duracao_ms: Date.now() - t0,
              };
            }
          })()
        );
      }
    }

    const resultados = await Promise.allSettled(tarefas);
    const fontes: Resultado[] = resultados.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : {
            fonte: "?",
            status: "ERRO",
            detalhes: String(r.reason),
            duracao_ms: 0,
          }
    );

    const totalCapturado = fontes.reduce((s, f) => s + (f.total ?? 0), 0);
    const sucessos = fontes.filter((f) => f.status === "OK").length;
    const erros = fontes.filter((f) => f.status === "ERRO").length;

    // Registra resumo
    await supabase().from("documento_consultas").insert({
      empresa_id,
      tipo: "STATUS_SERVICO",
      chave_acesso: cnpjLimpo,
      origem: "captura_tudo",
      status: erros === 0 ? "OK" : sucessos > 0 ? "OK" : "ERRO",
      mensagem: `${totalCapturado} documento(s) capturado(s) em ${fontes.length} fonte(s). OK=${sucessos} ERRO=${erros}`,
      payload_resposta: { fontes },
      duracao_ms: Date.now() - inicioTotal,
    });

    return NextResponse.json({
      status: erros === 0 ? "OK" : sucessos > 0 ? "PARCIAL" : "ERRO",
      total_capturado: totalCapturado,
      total_fontes: fontes.length,
      sucessos,
      erros,
      ambiente: ambienteEfetivo,
      periodo: { data_inicial, data_final },
      municipios_varridos: municipiosVarrer,
      fontes,
      duracao_ms: Date.now() - inicioTotal,
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
    descricao:
      "Orquestrador unificado: SEFAZ DF-e + NFS-e Nacional + ABRASF municipal em paralelo",
    metodo: "POST",
    body: {
      empresa_id: "uuid (obrigatorio)",
      ambiente: "producao | homologacao",
      data_inicial: "YYYY-MM-DD (opt, default 30 dias atras)",
      data_final: "YYYY-MM-DD (opt, default hoje)",
      municipios_abrasf: "string[] de IBGE (opt; default = sede + Osasco + Barueri + SP capital)",
      incluir_sefaz: "boolean (default true)",
      incluir_nfse_rfb: "boolean (default true)",
      incluir_abrasf: "boolean (default true)",
    },
  });
}
