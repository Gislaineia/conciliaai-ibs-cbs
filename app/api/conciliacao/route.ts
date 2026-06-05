/**
 * /api/conciliacao
 *
 * Conciliação fiscal automática para um período (YYYY-MM):
 *   1. Documentos capturados na SEFAZ (documentos_fiscais)
 *      vs documentos parseados/escriturados (documentos).
 *   2. Documentos emitidos pelo contribuinte (SAIDA) vs apuração de débitos.
 *   3. Documentos recebidos (ENTRADA) vs apuração de créditos.
 *
 * Gera registros em `conciliacao_periodo` e divergências classificadas.
 *
 * Body:
 *   { empresa_id: string, periodo: string /* YYYY-MM *\/ }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  try {
    const body = await req.json();
    const { empresa_id, periodo } = body as { empresa_id: string; periodo: string };

    if (!empresa_id || !periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
      return NextResponse.json(
        { status: "erro", mensagem: "empresa_id e periodo (YYYY-MM) obrigatórios" },
        { status: 400 }
      );
    }

    const dataIni = `${periodo}-01`;
    const [ano, mes] = periodo.split("-").map(Number);
    const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${new Date(ano, mes, 0).getDate()}`;

    // 1) Documentos capturados via SEFAZ no período
    const { data: capturados, error: e1 } = await supabase()
      .from("documentos_fiscais")
      .select("chave_acesso,schema,sim,parseado_em,importado_em")
      .eq("empresa_id", empresa_id)
      .gte("importado_em", dataIni)
      .lt("importado_em", `${dataFim}T23:59:59`);
    if (e1) throw new Error(e1.message);

    // 2) Documentos escriturados no período
    const { data: escriturados, error: e2 } = await supabase()
      .from("documentos")
      .select("id,chave_acesso,direcao,valor_total,valor_cbs_documento,valor_ibs_documento,status_classificacao,periodo_competencia")
      .eq("empresa_id", empresa_id)
      .eq("periodo_competencia", periodo);
    if (e2) throw new Error(e2.message);

    // 3) Apuração do período
    const { data: apuracao } = await supabase()
      .from("apuracoes")
      .select("*")
      .eq("empresa_id", empresa_id)
      .eq("periodo", periodo)
      .maybeSingle();

    // ─── Análises ─────────────────────────────────────────────────────────
    const setCapturados = new Set((capturados ?? []).map((c: any) => c.chave_acesso));
    const setEscriturados = new Set((escriturados ?? []).map((d: any) => d.chave_acesso));

    const capturadosNaoEscriturados = (capturados ?? []).filter(
      (c: any) => !setEscriturados.has(c.chave_acesso)
    );
    const escrituradosNaoCapturados = (escriturados ?? []).filter(
      (d: any) => !setCapturados.has(d.chave_acesso) && d.chave_acesso?.length === 44
    );

    const totalEntrada = (escriturados ?? [])
      .filter((d: any) => d.direcao === "ENTRADA")
      .reduce((s: number, d: any) => s + Number(d.valor_total ?? 0), 0);
    const totalSaida = (escriturados ?? [])
      .filter((d: any) => d.direcao === "SAIDA")
      .reduce((s: number, d: any) => s + Number(d.valor_total ?? 0), 0);
    const totalCbsDoc = (escriturados ?? []).reduce(
      (s: number, d: any) => s + Number(d.valor_cbs_documento ?? 0),
      0
    );
    const totalIbsDoc = (escriturados ?? []).reduce(
      (s: number, d: any) => s + Number(d.valor_ibs_documento ?? 0),
      0
    );

    const cbsApurada = Number(apuracao?.cbs_debitos ?? 0);
    const ibsApurada =
      Number(apuracao?.ibs_est_debitos ?? 0) + Number(apuracao?.ibs_mun_debitos ?? 0);

    // ─── Persistência da conciliação ──────────────────────────────────────
    const conciliacaoRow = {
      empresa_id,
      periodo,
      total_capturados: capturados?.length ?? 0,
      total_escriturados: escriturados?.length ?? 0,
      total_entrada: totalEntrada,
      total_saida: totalSaida,
      total_cbs_documentos: totalCbsDoc,
      total_ibs_documentos: totalIbsDoc,
      total_cbs_apurado: cbsApurada,
      total_ibs_apurado: ibsApurada,
      capturados_nao_escriturados: capturadosNaoEscriturados.length,
      escriturados_nao_capturados: escrituradosNaoCapturados.length,
      diferenca_cbs: Number((totalCbsDoc - cbsApurada).toFixed(2)),
      diferenca_ibs: Number((totalIbsDoc - ibsApurada).toFixed(2)),
      duracao_ms: Date.now() - inicio,
      executado_em: new Date().toISOString(),
    };

    const { data: conc, error: e3 } = await supabase()
      .from("conciliacao_periodo")
      .upsert(conciliacaoRow, { onConflict: "empresa_id,periodo" })
      .select()
      .single();
    if (e3) throw new Error(e3.message);

    // ─── Divergências (registra em divergencias quando severo) ────────────
    const divergencias: any[] = [];
    if (capturadosNaoEscriturados.length > 0) {
      divergencias.push({
        empresa_id,
        tipo: "DOC_FORA_PERIODO",
        severidade: "ATENCAO",
        titulo: `${capturadosNaoEscriturados.length} documento(s) capturados sem escrituração`,
        descricao: `Há ${capturadosNaoEscriturados.length} XMLs capturados via SEFAZ no período ${periodo} que não constam em documentos escriturados. Execute /api/documentos/parse.`,
        sugestao: "Execute o parser de XMLs (POST /api/documentos/parse) para escriturar os documentos.",
        status: "aberta",
      });
    }
    if (Math.abs(totalCbsDoc - cbsApurada) > 0.5) {
      divergencias.push({
        empresa_id,
        tipo: "VALOR_DESTACADO_DIVERGENTE",
        severidade: "CRITICO",
        titulo: `CBS documental difere da apuração em ${(totalCbsDoc - cbsApurada).toFixed(2)}`,
        descricao: `Soma de CBS nos documentos (${totalCbsDoc.toFixed(
          2
        )}) é diferente do CBS apurado (${cbsApurada.toFixed(2)}).`,
        sugestao: "Reabra a apuração e recalcule os créditos/débitos.",
        status: "aberta",
      });
    }

    if (divergencias.length > 0) {
      await supabase().from("divergencias").insert(divergencias);
    }

    return NextResponse.json({
      status: "OK",
      conciliacao: conc,
      divergencias_geradas: divergencias.length,
      capturados_nao_escriturados: capturadosNaoEscriturados.slice(0, 50),
      escriturados_nao_capturados: escrituradosNaoCapturados.slice(0, 50),
      duracao_ms: Date.now() - inicio,
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
      "Conciliação fiscal: confronta documentos_fiscais (capturados) x documentos (escriturados) x apurações.",
    metodo: "POST",
    body: { empresa_id: "uuid", periodo: "YYYY-MM" },
  });
}
