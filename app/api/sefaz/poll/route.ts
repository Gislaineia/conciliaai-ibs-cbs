import { NextRequest, NextResponse } from "next/server";

/**
 * Endpoint que dispara o pooling manual de NFs na SEFAZ.
 * Em produção, requer:
 * - Certificado A1 carregado e desbloqueado
 * - Cliente SOAP configurado (NfeDistDFeInteresse)
 * - Loop: para cada NSU/CNPJ, baixar lote, persistir XMLs
 *
 * Aqui, retorna estatística simulada.
 */
export async function POST(req: NextRequest) {
  try {
    const { empresa_id } = await req.json().catch(() => ({}));
    return NextResponse.json({
      status: "ok",
      empresa_id: empresa_id ?? null,
      capturados: 0,
      timestamp: new Date().toISOString(),
      message:
        "Stub: integração com SEFAZ ainda requer back-end dedicado. Use a captura manual em /captura.",
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: String((e as Error).message) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", message: "Use POST para disparar pooling." });
}
