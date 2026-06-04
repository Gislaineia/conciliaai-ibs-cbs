import { NextRequest, NextResponse } from "next/server";

/**
 * Endpoint que recebe push da SEFAZ quando há nova NF-e/CT-e/NFS-e.
 * Em produção:
 * - Validar assinatura/origem
 * - Carregar certificado A1 da empresa correspondente
 * - Persistir o XML cru e disparar o pipeline (parse → classifica → grava)
 *
 * Aqui, é apenas um stub que aceita o payload e retorna 200.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    // Em produção: validar XML, extrair chave, persistir.
    return NextResponse.json({
      status: "received",
      bytes: body.length,
      timestamp: new Date().toISOString(),
      message: "Stub: integração SEFAZ requer back-end dedicado com agente A1.",
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: String((e as Error).message) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    info: "POST este endpoint com o XML no corpo. SEFAZ usa SOAP — adapter requerido.",
  });
}
