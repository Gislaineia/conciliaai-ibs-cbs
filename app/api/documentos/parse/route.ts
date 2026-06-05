/**
 * /api/documentos/parse
 *
 * Bridge entre `documentos_fiscais` (XMLs brutos capturados via SEFAZ/NFS-e
 * push/poll) e `documentos`/`itens_documento` (modelo classificável).
 *
 * Fluxo:
 *  1. Lê documentos_fiscais com schema='nfeProc' ou 'cteProc' ainda não parseados.
 *  2. Para cada XML, chama parseXMLDocument (lib/xml-parser.ts).
 *  3. Faz upsert em documentos + itens_documento (associando à empresa_id).
 *  4. Marca documentos_fiscais.parseado_em = now().
 *
 * Body opcional:
 *   { empresa_id?: string, limit?: number, force?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseXMLDocument } from "@/lib/xml-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let _sb: SupabaseClient | null = null;
function supabase(): SupabaseClient {
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
    const body = await req.json().catch(() => ({}));
    const { empresa_id, limit = 100, force = false } = body as {
      empresa_id?: string;
      limit?: number;
      force?: boolean;
    };

    let q = supabase()
      .from("documentos_fiscais")
      .select("id,empresa_id,chave_acesso,xml,schema,parseado_em")
      .in("schema", ["nfeProc", "cteProc", "nfse"])
      .order("importado_em", { ascending: true })
      .limit(limit);
    if (empresa_id) q = q.eq("empresa_id", empresa_id);
    if (!force) q = q.is("parseado_em", null);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const resultados: Array<{
      chave: string;
      ok: boolean;
      mensagem?: string;
      documento_id?: string;
    }> = [];

    for (const row of rows ?? []) {
      try {
        const parsed = parseXMLDocument(row.xml as string);

        // Verifica se documento já existe (para evitar duplicar itens)
        const { data: existente } = await supabase()
          .from("documentos")
          .select("id")
          .eq("chave_acesso", parsed.documento.chave_acesso)
          .maybeSingle();

        let documentoId: string;
        if (existente?.id) {
          documentoId = existente.id;
          // não duplica itens
        } else {
          const docToInsert = {
            ...parsed.documento,
            empresa_id: row.empresa_id,
          };
          const { data: docIns, error: docErr } = await supabase()
            .from("documentos")
            .insert(docToInsert)
            .select()
            .single();
          if (docErr) throw new Error(docErr.message);
          documentoId = docIns.id;

          if (parsed.itens.length > 0) {
            const itensRows = parsed.itens.map((it) => ({
              ...it,
              documento_id: documentoId,
            }));
            const { error: itErr } = await supabase()
              .from("itens_documento")
              .insert(itensRows);
            if (itErr) throw new Error(`itens: ${itErr.message}`);
          }
        }

        await supabase()
          .from("documentos_fiscais")
          .update({ parseado_em: new Date().toISOString() })
          .eq("id", row.id);

        resultados.push({
          chave: parsed.documento.chave_acesso,
          ok: true,
          documento_id: documentoId,
        });
      } catch (e: any) {
        resultados.push({
          chave: row.chave_acesso,
          ok: false,
          mensagem: e.message,
        });
        await supabase()
          .from("documentos_fiscais")
          .update({ parse_erro: String(e.message ?? e).slice(0, 500) })
          .eq("id", row.id);
      }
    }

    const ok = resultados.filter((r) => r.ok).length;
    const fail = resultados.length - ok;

    return NextResponse.json({
      status: "OK",
      processados: resultados.length,
      sucesso: ok,
      falha: fail,
      duracao_ms: Date.now() - inicio,
      resultados,
    });
  } catch (e) {
    return NextResponse.json(
      { status: "erro", mensagem: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // Suporta cron Vercel: GET com Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${process.env.CRON_SECRET}`) {
    return POST(
      new NextRequest(req.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 200 }),
      })
    );
  }
  return NextResponse.json({
    descricao:
      "Parseia XMLs brutos em documentos_fiscais para documentos+itens_documento. Chame após captura SEFAZ/NFS-e.",
    metodo: "POST",
    body: { empresa_id: "(opt)", limit: 100, force: false },
  });
}
