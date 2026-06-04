/**
 * /api/setup - Endpoint de configuracao inicial
 * Adiciona NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel via API server-side
 * Chamar UMA VEZ apos o deploy: POST /api/setup com header Authorization: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
          return NextResponse.json({ erro: "Nao autorizado" }, { status: 401 });
        }

    const vercelToken = process.env.VERCEL_TOKEN;
    const anonKey = process.env.SUPABASE_ANON_KEY_SETUP;
    const projectId = process.env.VERCEL_PROJECT_ID ?? "conciliaai-ibs-cbs";

    if (!vercelToken || !anonKey) {
          return NextResponse.json({
                  erro: "Configure VERCEL_TOKEN e SUPABASE_ANON_KEY_SETUP nas variaveis da Vercel antes de chamar este endpoint",
                  instrucoes: {
                            passo1: "No dashboard Vercel, adicione VERCEL_TOKEN (seu token Vercel) e SUPABASE_ANON_KEY_SETUP (a anon key do Supabase)",
                            passo2: "Chame POST /api/setup com Authorization: Bearer <CRON_SECRET>",
                            anonKeyValue: "A chave anon pode ser encontrada em: Supabase > Settings > API Keys > anon public"
                          }
                }, { status: 400 });
        }

    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
          method: "POST",
          headers: {
                  "Authorization": `Bearer ${vercelToken}`,
                  "Content-Type": "application/json",
                },
          body: JSON.stringify({
                  key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                  value: anonKey,
                  type: "plain",
                  target: ["production", "preview", "development"],
                }),
        });

    const data = await res.json();
    if (!res.ok) {
          return NextResponse.json({ erro: "Vercel API error", detalhes: data }, { status: 500 });
        }

    return NextResponse.json({
          ok: true,
          mensagem: "NEXT_PUBLIC_SUPABASE_ANON_KEY adicionada com sucesso na Vercel",
          variavelId: data.id,
        });
  }

export async function GET() {
    return NextResponse.json({
          instrucoes: "Use POST com Authorization: Bearer <CRON_SECRET> para configurar as variaveis",
          variaveis_necessarias: [
                  "VERCEL_TOKEN - Token da Vercel (vcp_...)",
                  "SUPABASE_ANON_KEY_SETUP - Chave anon do Supabase (eyJ...)",
                  "CRON_SECRET - ja configurado"
                ]
        });
  }
