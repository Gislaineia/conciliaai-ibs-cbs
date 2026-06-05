/**
 * /api/sefaz/webhook
 *
 * Recebe push assíncrono de XMLs (NF-e/CT-e/NFS-e) provenientes:
 *  - Do DF-e (NFeDistribuicaoDFe) repostado por integradores parceiros.
 *  - De portais municipais que oferecem callback HTTP.
 *  - De provedores de captura (Sieg, Arquivei, eNotas, FocusNFe etc.).
 *
 * Resolve a empresa pelo CNPJ do destinatário (UUID), faz UPSERT idempotente
 * em `documentos_fiscais` e registra o evento em `documento_consultas`.
 *
 * Aceita JSON:
 *   { xml: "<...>", origem?: "sieg|arquivei|sefaz_push|...", chave?: "44 dig" }
 * ou XML puro como body.
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

// ─── helpers ──────────────────────────────────────────────────────────────
function detectarSchema(xml: string): "nfeProc" | "cteProc" | "nfse" | "desconhecido" {
  if (xml.includes("nfeProc") || xml.includes("<NFe")) return "nfeProc";
  if (xml.includes("cteProc") || xml.includes("<CTe")) return "cteProc";
  if (xml.includes("CompNfse") || xml.includes("<Nfse")) return "nfse";
  return "desconhecido";
}

function extrairChave(xml: string): string | null {
  const m1 = xml.match(/chNFe[^>]*>([0-9]{44})/);
  if (m1) return m1[1];
  const m2 = xml.match(/chCTe[^>]*>([0-9]{44})/);
  if (m2) return m2[1];
  const m3 = xml.match(/Id="(?:NFe|CTe)([0-9]{44})"/);
  if (m3) return m3[1];
  // NFS-e: usa CodigoVerificacao + Numero quando não há chave de 44 dígitos
  const cod = xml.match(/<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/)?.[1];
  const num = xml.match(/<Numero>([^<]+)<\/Numero>/)?.[1];
  if (cod && num) return `NFSE-${num}-${cod}`;
  return null;
}

function extrairCnpjDestinatario(xml: string): string | null {
  return (
    xml.match(/<dest>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/)?.[1] ??
    xml.match(/<toma\d?>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/)?.[1] ??
    xml.match(/<TomadorServico>[\s\S]*?<Cnpj>(\d{14})<\/Cnpj>/)?.[1] ??
    xml.match(/<destinatario>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/)?.[1] ??
    null
  );
}

function extrairCnpjEmitente(xml: string): string | null {
  return (
    xml.match(/<emit>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/)?.[1] ??
    xml.match(/<PrestadorServico>[\s\S]*?<Cnpj>(\d{14})<\/Cnpj>/)?.[1] ??
    null
  );
}

async function resolverEmpresaId(cnpj: string | null): Promise<string | null> {
  if (!cnpj) return null;
  // tenta com e sem máscara
  const variantes = [cnpj, cnpj.replace(/\D/g, "")];
  for (const c of variantes) {
    const { data } = await supabase()
      .from("empresa")
      .select("id")
      .ilike("cnpj", c)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

// ─── POST ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let xml = "";
    let origem = "sefaz_webhook";
    let chaveOverride: string | null = null;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      xml = body.xml ?? "";
      origem = body.origem ?? origem;
      chaveOverride = body.chave ?? null;
    } else {
      xml = await req.text();
    }

    if (!xml || xml.length < 100) {
      return NextResponse.json(
        { status: "erro", mensagem: "Payload XML vazio ou inválido" },
        { status: 400 }
      );
    }

    const schema = detectarSchema(xml);
    const chave = chaveOverride ?? extrairChave(xml);
    if (!chave) {
      return NextResponse.json(
        { status: "erro", mensagem: "Chave de acesso não encontrada no XML" },
        { status: 422 }
      );
    }

    const cnpjDest = extrairCnpjDestinatario(xml);
    const cnpjEmit = extrairCnpjEmitente(xml);
    // Empresa é (em quase todos os casos) o tomador/destinatário do documento
    const empresaId =
      (await resolverEmpresaId(cnpjDest)) ?? (await resolverEmpresaId(cnpjEmit));

    if (!empresaId) {
      // Mantemos a mensagem porque sem empresa não há FK válida em documentos_fiscais
      return NextResponse.json(
        {
          status: "ignorado",
          mensagem: "Nenhuma empresa cadastrada com este CNPJ destinatário/emitente",
          cnpj_destinatario: cnpjDest,
          cnpj_emitente: cnpjEmit,
        },
        { status: 200 }
      );
    }

    const { error } = await supabase().from("documentos_fiscais").upsert(
      {
        empresa_id: empresaId,
        chave_acesso: chave,
        xml,
        schema,
        nsu: "",
        sim: origem,
        importado_em: new Date().toISOString(),
      },
      { onConflict: "chave_acesso" }
    );
    if (error) throw new Error(`Supabase: ${error.message}`);

    // Registra histórico de evento
    await supabase().from("documento_consultas").insert({
      empresa_id: empresaId,
      tipo: "WEBHOOK",
      chave_acesso: chave,
      origem,
      status: "OK",
      mensagem: "XML recebido via webhook",
      payload_resposta: { schema, bytes: xml.length },
    });

    return NextResponse.json({
      status: "recebido",
      empresa_id: empresaId,
      chave,
      schema,
      bytes: xml.length,
      origem,
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
  return NextResponse.json({
    status: "OK",
    info:
      "POST com XML no body (text/xml) ou JSON { xml, origem?, chave? }. Endpoint para push externo da SEFAZ ou de integradores.",
  });
}
