/**
 * /api/nfe/status-servico
 *
 * Verifica disponibilidade da SEFAZ (NfeStatusServico4) por UF.
 * Útil para diagnóstico antes de tentar polling/consulta.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  carregarCertificadoA1,
  soapPost,
  SEFAZ_AUTORIZADORA,
  UF_COD,
  extrairValor,
} from "@/lib/sefaz";
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

function montarConsStatServ(uf: string, ambiente: "producao" | "homologacao"): string {
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const cUF = UF_COD[uf];
  return `<?xml version="1.0" encoding="UTF-8"?>
<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <tpAmb>${tpAmb}</tpAmb>
  <cUF>${cUF}</cUF>
  <xServ>STATUS</xServ>
</consStatServ>`;
}

function envolver(payload: string, uf: string): string {
  const cUF = UF_COD[uf];
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">
      <cUF>${cUF}</cUF>
      <versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">
      ${payload}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let {
      empresa_id,
      uf,
      pfx_base64,
      pfx_senha,
      ambiente = "homologacao",
    } = body as {
      empresa_id?: string;
      uf: string;
      pfx_base64?: string;
      pfx_senha?: string;
      ambiente?: "producao" | "homologacao";
    };
    uf = (uf ?? "").toUpperCase();
    if (!UF_COD[uf]) {
      return NextResponse.json({ status: "erro", mensagem: "UF inválida" }, { status: 400 });
    }
    if ((!pfx_base64 || !pfx_senha) && empresa_id) {
      const { data: emp } = await supabase()
        .from("empresa")
        .select("pfx_base64,pfx_senha,ambiente")
        .eq("id", empresa_id)
        .maybeSingle();
      pfx_base64 = pfx_base64 ?? emp?.pfx_base64 ?? undefined;
      pfx_senha = pfx_senha ?? emp?.pfx_senha ?? undefined;
      ambiente = (emp?.ambiente as any) ?? ambiente;
    }
    if (!pfx_base64 || !pfx_senha) {
      return NextResponse.json(
        { status: "erro", mensagem: "Certificado A1 ausente" },
        { status: 400 }
      );
    }

    const url = SEFAZ_AUTORIZADORA[uf].status[ambiente];
    const { certPem, keyPem } = await carregarCertificadoA1(pfx_base64, pfx_senha);
    const xmlResp = await soapPost(
      url,
      envolver(montarConsStatServ(uf, ambiente), uf),
      certPem,
      keyPem,
      { soapAction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF" }
    );
    const cStat = extrairValor(xmlResp, "cStat");
    const xMotivo = extrairValor(xmlResp, "xMotivo");
    const tMed = extrairValor(xmlResp, "tMed");

    return NextResponse.json({
      status: cStat === "107" ? "OPERANTE" : "INDISPONIVEL",
      uf,
      ambiente,
      cStat,
      xMotivo,
      tempo_medio_resposta_seg: tMed,
      url_consultada: url,
      xml_resposta: xmlResp,
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
    descricao: "Verifica disponibilidade SEFAZ (cStat=107 → operante)",
    body: { uf: "SP|RS|...", empresa_id: "(opt)", ambiente: "producao|homologacao" },
  });
}
