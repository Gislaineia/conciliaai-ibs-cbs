/**
 * /api/nfse/sp
 *
 * Conector NFe-SP (Sao Paulo capital) - sistema proprio nao-ABRASF.
 * Schema: PedidoConsultaNFePeriodo / RetornoConsulta
 * Servico SOAP: ConsultaNFePeriodo
 *
 * Endpoints:
 *   - producao:    https://nfe.prefeitura.sp.gov.br/ws/lotenfe.asmx
 *   - homologacao: https://nfeh.prefeitura.sp.gov.br/ws/lotenfe.asmx
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignedXml } from "xml-crypto";
import { XMLParser } from "fast-xml-parser";
import { carregarCertificadoA1, soapPost } from "@/lib/sefaz";

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

const ENDPOINTS = {
  producao: "https://nfe.prefeitura.sp.gov.br/ws/lotenfe.asmx",
  homologacao: "https://nfeh.prefeitura.sp.gov.br/ws/lotenfe.asmx",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

function assinarXmlSp(xml: string, keyPem: string, certPem: string): string {
  const x509 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\n/g, "");
  const sig = new SignedXml({
    privateKey: keyPem,
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    getKeyInfoContent: () => `<X509Data><X509Certificate>${x509}</X509Certificate></X509Data>`,
  } as any);
  sig.addReference({
    xpath: "//*[local-name()='PedidoConsultaNFePeriodo']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  sig.computeSignature(xml);
  return sig.getSignedXml();
}

function montarPedidoConsultaSP(cnpj: string, dtIni: string, dtFim: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<PedidoConsultaNFePeriodo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                          xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                          xmlns="http://www.prefeitura.sp.gov.br/nfe">
  <Cabecalho Versao="1">
    <CPFCNPJRemetente><CNPJ>${cnpj}</CNPJ></CPFCNPJRemetente>
    <CPFCNPJTomador><CNPJ>${cnpj}</CNPJ></CPFCNPJTomador>
    <dtInicio>${dtIni}</dtInicio>
    <dtFim>${dtFim}</dtFim>
    <NumeroPagina>1</NumeroPagina>
  </Cabecalho>
</PedidoConsultaNFePeriodo>`;
}

function envolverSoapSP(xmlAssinado: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ConsultaNFePeriodo xmlns="http://www.prefeitura.sp.gov.br/nfe">
      <VersaoSchema>1</VersaoSchema>
      <MensagemXML><![CDATA[${xmlAssinado}]]></MensagemXML>
    </ConsultaNFePeriodo>
  </soap:Body>
</soap:Envelope>`;
}

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  try {
    const body = await req.json();
    let {
      empresa_id,
      cnpj,
      pfx_base64,
      pfx_senha,
      data_inicial,
      data_final,
      ambiente = "homologacao",
    } = body;

    if ((!pfx_base64 || !pfx_senha) && empresa_id) {
      const { data: emp } = await supabase()
        .from("empresa")
        .select("pfx_base64,pfx_senha,ambiente,cnpj")
        .eq("id", empresa_id)
        .maybeSingle();
      pfx_base64 = pfx_base64 ?? emp?.pfx_base64;
      pfx_senha = pfx_senha ?? emp?.pfx_senha;
      cnpj = cnpj ?? emp?.cnpj;
      ambiente = (emp?.ambiente as any) ?? ambiente;
    }

    cnpj = String(cnpj ?? "").replace(/\D/g, "");
    if (!cnpj || !pfx_base64 || !pfx_senha || !data_inicial || !data_final) {
      return NextResponse.json(
        { status: "erro", mensagem: "cnpj, pfx_base64, pfx_senha, data_inicial e data_final obrigatorios" },
        { status: 400 }
      );
    }

    const url = ENDPOINTS[ambiente as keyof typeof ENDPOINTS];
    const { certPem, keyPem } = await carregarCertificadoA1(pfx_base64, pfx_senha);

    const pedido = montarPedidoConsultaSP(cnpj, data_inicial, data_final);
    const assinado = assinarXmlSp(pedido, keyPem, certPem);
    const soap = envolverSoapSP(assinado);

    let xmlResposta = "";
    try {
      xmlResposta = await soapPost(url, soap, certPem, keyPem, {
        contentType: "text/xml; charset=utf-8",
        soapAction: "http://www.prefeitura.sp.gov.br/nfe/ConsultaNFePeriodo",
      });
    } catch (e: any) {
      const msg = String(e?.cause?.code ?? e?.code ?? e?.message ?? e);
      return NextResponse.json(
        {
          status: "erro",
          mensagem: `Falha de rede ao chamar ${url}: ${msg}`,
          url_consultada: url,
        },
        { status: 502 }
      );
    }

    const parsed = parser.parse(xmlResposta);
    const ret =
      parsed?.Envelope?.Body?.ConsultaNFePeriodoResponse?.RetornoXML ??
      parsed?.Envelope?.Body?.ConsultaNFePeriodoResponse ?? {};
    const retornoXmlInner =
      typeof ret === "string"
        ? ret
        : ret?.RetornoConsulta ??
          xmlResposta.match(/<RetornoConsulta[\s\S]*?<\/RetornoConsulta>/)?.[0] ??
          "";
    const retornoParsed = parser.parse(retornoXmlInner || xmlResposta);
    const cabec = retornoParsed?.RetornoConsulta?.Cabecalho ?? {};
    const sucesso = String(cabec?.Sucesso ?? "false") === "true";
    const erro = retornoParsed?.RetornoConsulta?.Erro;

    if (!sucesso && erro) {
      const codigo = String(erro?.Codigo ?? "?");
      const desc = String(erro?.Descricao ?? "");
      if (empresa_id) {
        await supabase().from("documento_consultas").insert({
          empresa_id,
          tipo: "NFSE_ABRASF",
          chave_acesso: cnpj,
          origem: "sp_capital",
          status: "ERRO",
          mensagem: `SP ${codigo}: ${desc}`,
          payload_resposta: { codigo, desc },
          duracao_ms: Date.now() - inicio,
        });
      }
      return NextResponse.json(
        {
          status: "erro",
          mensagem: `Prefeitura SP retornou erro ${codigo}: ${desc}`,
          codigo,
          xml_resposta: xmlResposta,
        },
        { status: 200 }
      );
    }

    // Extrair NFS-e
    const lista = retornoParsed?.RetornoConsulta?.NFe ?? [];
    const docs = Array.isArray(lista) ? lista : lista ? [lista] : [];
    const salvos: string[] = [];

    for (const nfe of docs) {
      const numero = String(nfe?.ChaveNFe?.NumeroNFe ?? nfe?.Numero ?? Date.now());
      const codVerif = nfe?.ChaveNFe?.CodigoVerificacao ?? "";
      const chave = `SP-${numero}-${codVerif}`;
      try {
        await supabase().from("documentos_fiscais").upsert(
          {
            empresa_id: empresa_id ?? null,
            chave_acesso: chave,
            xml: typeof nfe === "string" ? nfe : JSON.stringify(nfe),
            schema: "nfse",
            nsu: numero,
            sim: "sp_capital",
            importado_em: new Date().toISOString(),
          },
          { onConflict: "chave_acesso" }
        );
        salvos.push(chave);
      } catch {
        /* skip */
      }
    }

    if (empresa_id) {
      await supabase().from("documento_consultas").insert({
        empresa_id,
        tipo: "NFSE_ABRASF",
        chave_acesso: cnpj,
        origem: "sp_capital",
        status: "OK",
        mensagem: `${salvos.length} NFS-e capturadas (SP capital)`,
        payload_resposta: { total: salvos.length },
        duracao_ms: Date.now() - inicio,
      });
    }

    return NextResponse.json({
      status: "OK",
      municipio: "São Paulo (capital)",
      municipio_ibge: "3550308",
      total_capturados: salvos.length,
      ambiente,
      url_consultada: url,
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
    descricao: "Conector NFe-SP (Sao Paulo capital) - schema proprio",
    endpoints: ENDPOINTS,
    metodo: "POST",
    body: { cnpj: "14 digitos", data_inicial: "YYYY-MM-DD", data_final: "YYYY-MM-DD" },
  });
}
