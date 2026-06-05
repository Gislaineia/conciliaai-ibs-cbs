/**
 * /api/consultas
 *
 * Histórico de consultas SEFAZ realizadas (NF-e por chave, cadastro CNPJ,
 * polling, webhook). Lê documento_consultas.
 *
 * GET ?empresa_id=...&limit=50&tipo=NFE_CHAVE
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const empresa_id = searchParams.get("empresa_id");
    const tipo = searchParams.get("tipo");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 500);

    let q = supabase()
      .from("documento_consultas")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(limit);
    if (empresa_id) q = q.eq("empresa_id", empresa_id);
    if (tipo) q = q.eq("tipo", tipo);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return NextResponse.json({ status: "OK", total: data?.length ?? 0, consultas: data });
  } catch (e) {
    return NextResponse.json(
      { status: "erro", mensagem: (e as Error).message },
      { status: 500 }
    );
  }
}
