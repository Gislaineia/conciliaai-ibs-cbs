import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

const parser = new XMLParser({ ignoreAttributes: false });

// ─── POST: recebe push da SEFAZ com XML da NF-e/CT-e ────────────────────
export async function POST(req: NextRequest) {
    try {
          const xml = await req.text();

      if (!xml || xml.length < 100) {
              return NextResponse.json(
                { status: "erro", mensagem: "Payload XML vazio ou inválido" },
                { status: 400 }
                      );
      }

      // Extrai chave de acesso (44 dígitos)
      const chave = xml.match(/chNFe[^>]*>([0-9]{44})/)?.[1]
            ?? xml.match(/chave[^>]*>([0-9]{44})/)?.[1];

      if (!chave) {
              return NextResponse.json(
                { status: "erro", mensagem: "chNFe não encontrada no XML recebido" },
                { status: 422 }
                      );
      }

      // CNPJ do destinatário (empresa que recebe a nota)
      const cnpjDest = xml.match(/<dest>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/)?.[1]
            ?? xml.match(/<tomador>[\s\S]*?<CNPJ>(\d{14})<\/CNPJ>/)?.[1]
            ?? "desconhecido";

      // Detecta tipo de documento
      const schema = xml.includes("nfeProc")
            ? "nfeProc"
              : xml.includes("cteProc")
            ? "cteProc"
              : xml.includes("CompNfse")
            ? "nfse"
              : "desconhecido";

      // Persiste no Supabase (upsert para evitar duplicatas)
      const { error } = await supabase.from("documentos_fiscais").upsert(
        {
                  empresa_id:   cnpjDest,
                  chave_acesso: chave,
                  xml,
                  schema,
                  nsu:          "",
                  origem:       "sefaz_webhook",
                  importado_em: new Date().toISOString(),
        },
        { onConflict: "chave_acesso" }
            );

      if (error) throw new Error(`Supabase: ${error.message}`);

      return NextResponse.json({
              status:    "recebido",
              chave,
              schema,
              cnpj_dest: cnpjDest,
              bytes:     xml.length,
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
          info: "POST com XML no body. Endpoint registrado para push da SEFAZ.",
    });
}
