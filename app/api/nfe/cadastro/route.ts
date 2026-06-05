/**
 * /api/nfe/cadastro
 *
 * Consulta cadastro de contribuinte ICMS (NF-e CadConsultaCadastro4).
 * Retorna IE, situação cadastral, regime, endereço, etc.
 *
 * Body JSON:
 *   {
 *     empresa_id?: string,
 *     uf: string,                  // UF a consultar (ex: "SP")
 *     cnpj?: string,               // (um dos três)
 *     cpf?: string,
 *     ie?: string,
 *     pfx_base64?: string,
 *     pfx_senha?: string,
 *     ambiente?: "producao"|"homologacao"
 *   }
 *
 * Observação: CadConsultaCadastro4 não é oferecido por todas as UFs
 * (RJ não disponibiliza, por exemplo). O mapa abaixo cobre as principais.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import {
  carregarCertificadoA1,
  soapPost,
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

// Endpoints CadConsultaCadastro4 (subset; outras UFs caem em SVRS)
const CAD_ENDPOINTS: Record<string, { producao: string; homologacao: string }> = {
  SP: {
    producao: "https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx",
    homologacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx",
  },
  RS: {
    producao: "https://nfe.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx",
    homologacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx",
  },
  PR: {
    producao: "https://nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4",
    homologacao: "https://homologacao.nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4",
  },
  MG: {
    producao: "https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4",
    homologacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4",
  },
  BA: {
    producao: "https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx",
    homologacao: "https://hnfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx",
  },
  MS: {
    producao: "https://nfe.fazenda.ms.gov.br/producao/services2/CadConsultaCadastro4",
    homologacao: "https://hom.nfe.sefaz.ms.gov.br/homologacao/services2/CadConsultaCadastro4",
  },
  MT: {
    producao: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4",
    homologacao: "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4",
  },
  PE: {
    producao: "https://nfe.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4",
    homologacao: "https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4",
  },
  GO: {
    producao: "https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4",
    homologacao: "https://homolog.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4",
  },
  // demais UFs → fallback SVRS
};

const SVRS_FALLBACK = {
  producao: "https://nfe.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx",
  homologacao: "https://nfe-homologacao.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx",
};

function montarConsCad(
  uf: string,
  ids: { cnpj?: string; cpf?: string; ie?: string }
): string {
  let id = "";
  if (ids.cnpj) id = `<CNPJ>${ids.cnpj}</CNPJ>`;
  else if (ids.cpf) id = `<CPF>${ids.cpf}</CPF>`;
  else if (ids.ie) id = `<IE>${ids.ie}</IE>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00">
  <infCons>
    <xServ>CONS-CAD</xServ>
    <UF>${uf}</UF>
    ${id}
  </infCons>
</ConsCad>`;
}

function envolver(payload: string, uf: string): string {
  const cUF = UF_COD[uf] ?? "35";
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4">
      <cUF>${cUF}</cUF>
      <versaoDados>2.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4">
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
      uf,
      cnpj,
      cpf,
      ie,
      pfx_base64,
      pfx_senha,
      ambiente = "homologacao",
    } = body as {
      empresa_id?: string;
      uf: string;
      cnpj?: string;
      cpf?: string;
      ie?: string;
      pfx_base64?: string;
      pfx_senha?: string;
      ambiente?: "producao" | "homologacao";
    };

    uf = (uf ?? "").toUpperCase();
    if (!uf || !UF_COD[uf]) {
      return NextResponse.json({ status: "erro", mensagem: "UF inválida" }, { status: 400 });
    }
    cnpj = cnpj?.replace(/\D/g, "");
    cpf = cpf?.replace(/\D/g, "");
    ie = ie?.replace(/\D/g, "");
    if (!cnpj && !cpf && !ie) {
      return NextResponse.json(
        { status: "erro", mensagem: "Informe CNPJ, CPF ou IE" },
        { status: 400 }
      );
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

    const ep = CAD_ENDPOINTS[uf]?.[ambiente] ?? SVRS_FALLBACK[ambiente];
    const { certPem, keyPem } = await carregarCertificadoA1(pfx_base64, pfx_senha);
    const payload = montarConsCad(uf, { cnpj, cpf, ie });
    const envelope = envolver(payload, uf);
    const xmlResposta = await soapPost(ep, envelope, certPem, keyPem, {
      soapAction: "http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4/consultaCadastro",
    });

    const cStat = extrairValor(xmlResposta, "cStat");
    const xMotivo = extrairValor(xmlResposta, "xMotivo");
    const ok = cStat === "111" || cStat === "112";

    if (empresa_id) {
      await supabase().from("documento_consultas").insert({
        empresa_id,
        tipo: "CADASTRO_CNPJ",
        chave_acesso: cnpj ?? cpf ?? ie ?? "",
        origem: "sefaz_cad_consulta",
        status: ok ? "OK" : "ERRO",
        mensagem: `${cStat} - ${xMotivo}`,
        payload_resposta: { cStat, xMotivo },
        duracao_ms: Date.now() - inicio,
      });
    }

    return NextResponse.json({
      status: ok ? "OK" : "ERRO",
      uf,
      ambiente,
      cStat,
      xMotivo,
      url_consultada: ep,
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
    descricao: "Consulta cadastro ICMS (CadConsultaCadastro4) por CNPJ/CPF/IE em UF",
    metodo: "POST",
    body: { uf: "SP|RS|...", cnpj: "(opt)", cpf: "(opt)", ie: "(opt)", empresa_id: "(opt)" },
  });
}
