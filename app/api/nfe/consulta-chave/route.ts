/**
 * /api/nfe/consulta-chave
 *
 * Consulta status/conteúdo de uma NF-e (modelo 55) ou CT-e (modelo 57) pela
 * chave de acesso de 44 dígitos. Usa o WebService NfeConsultaProtocolo4 da
 * SEFAZ autorizadora correspondente à UF da chave (cUF = 2 primeiros dígitos).
 *
 * Body JSON:
 *   {
 *     empresa_id?: string,        // FK para empresa (para histórico)
 *     chave_acesso: string,       // 44 dígitos
 *     pfx_base64?: string,        // se ausente, usa empresa.pfx_base64
 *     pfx_senha?: string,         // se ausente, usa empresa.pfx_senha
 *     ambiente?: "producao"|"homologacao"
 *   }
 *
 * Retorno: { status, cStat, xMotivo, protocolo, xml_resposta, xml_nfe? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import {
  carregarCertificadoA1,
  soapPost,
  ufFromChave,
  SEFAZ_AUTORIZADORA,
  UF_COD,
  extrairValor,
} from "@/lib/sefaz";

let _sb: any = null;
function supabase() {
  if (_sb) return _sb;
  _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  return _sb;
}

function montarConsSitNFe(chave: string, ambiente: "producao" | "homologacao"): string {
  const tpAmb = ambiente === "producao" ? "1" : "2";
  return `<?xml version="1.0" encoding="UTF-8"?>
<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <tpAmb>${tpAmb}</tpAmb>
  <xServ>CONSULTAR</xServ>
  <chNFe>${chave}</chNFe>
</consSitNFe>`;
}

function envolverSoap(payload: string, uf: string): string {
  const cUF = UF_COD[uf] ?? "35";
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">
      <cUF>${cUF}</cUF>
      <versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">
      ${payload}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  try {
    const body = await req.json();
    let {
      empresa_id,
      chave_acesso,
      pfx_base64,
      pfx_senha,
      ambiente = "homologacao",
    } = body as {
      empresa_id?: string;
      chave_acesso: string;
      pfx_base64?: string;
      pfx_senha?: string;
      ambiente?: "producao" | "homologacao";
    };

    chave_acesso = String(chave_acesso ?? "").replace(/\D/g, "");
    if (chave_acesso.length !== 44) {
      return NextResponse.json(
        { status: "erro", mensagem: "chave_acesso deve ter 44 dígitos" },
        { status: 400 }
      );
    }

    // Carrega cert da empresa quando não enviado
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
        { status: "erro", mensagem: "Certificado A1 ausente (pfx_base64 + pfx_senha ou empresa_id)" },
        { status: 400 }
      );
    }

    const uf = ufFromChave(chave_acesso);
    if (!uf) {
      return NextResponse.json(
        { status: "erro", mensagem: `cUF inválido em chave de acesso: ${chave_acesso.substring(0, 2)}` },
        { status: 422 }
      );
    }

    const sefaz = SEFAZ_AUTORIZADORA[uf];
    const url = sefaz.consulta[ambiente];

    const { certPem, keyPem } = await carregarCertificadoA1(pfx_base64, pfx_senha);

    const consSit = montarConsSitNFe(chave_acesso, ambiente);
    const envelope = envolverSoap(consSit, uf);
    const xmlResposta = await soapPost(url, envelope, certPem, keyPem, {
      soapAction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF",
    });

    const cStat = extrairValor(xmlResposta, "cStat");
    const xMotivo = extrairValor(xmlResposta, "xMotivo");
    const nProt = extrairValor(xmlResposta, "nProt");

    // 100 = autorizado, 101 = cancelado, 110 = denegado
    const ok = cStat === "100" || cStat === "101";

    // Persiste histórico de consulta
    if (empresa_id) {
      await supabase().from("documento_consultas").insert({
        empresa_id,
        tipo: "NFE_CHAVE",
        chave_acesso,
        origem: "sefaz_consulta_protocolo",
        status: ok ? "OK" : "ERRO",
        mensagem: `${cStat} - ${xMotivo}`,
        payload_resposta: { cStat, xMotivo, nProt },
        duracao_ms: Date.now() - inicio,
      });
    }

    return NextResponse.json({
      status: ok ? "OK" : "ERRO",
      uf,
      ambiente,
      cStat,
      xMotivo,
      protocolo: nProt,
      url_consultada: url,
      xml_resposta: xmlResposta,
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
    descricao: "Consulta NF-e/CT-e por chave de 44 dígitos via NfeConsultaProtocolo4",
    metodo: "POST",
    body: {
      chave_acesso: "44 dígitos numéricos",
      empresa_id: "(opcional) usa cert da empresa",
      pfx_base64: "(alternativa) cert A1 em base64",
      pfx_senha: "(alternativa) senha do cert",
      ambiente: "producao | homologacao",
    },
  });
}
