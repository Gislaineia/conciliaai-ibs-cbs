/**
 * /api/nfse/poll
 *
 * Consulta NFS-e RECEBIDAS no Sistema Nacional NFS-e (SNNFS-e) — Portal RFB.
 * Endpoints oficiais ADN (Ambiente de Dados Nacional):
 *   - producao:    https://adn.nfse.gov.br/contribuinte/v1
 *   - homologacao: https://adnh.producaorestrita.nfse.gov.br/contribuinte/v1
 *
 * Body:
 *   { empresa_id, cnpj, pfx_base64, pfx_senha, data_inicio, data_fim, ambiente }
 *
 * Importante:
 *   - O Portal Nacional NFS-e exige Certificado Digital A1 (mTLS).
 *   - Nem todos os municipios estao aderidos; municipios proprios usam ABRASF
 *     (ver /api/nfse/abrasf).
 */
import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { createClient } from "@supabase/supabase-js";
import https from "https";

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

const BASE_URL = {
  producao:    "https://adn.nfse.gov.br/contribuinte/v1",
  homologacao: "https://adnh.producaorestrita.nfse.gov.br/contribuinte/v1",
};

function carregarCertificado(pfxBase64: string, senha: string) {
  const pfxDer  = forge.util.decode64(pfxBase64);
  const pfxAsn1 = forge.asn1.fromDer(pfxDer);
  const pfx     = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, senha);
  const certBag = pfx.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  const keyBag  = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!certBag?.cert || !keyBag?.key) {
    throw new Error("Certificado A1 invalido: bag cert/key ausente. Confira PFX e senha.");
  }
  return {
    certPem: forge.pki.certificateToPem(certBag.cert),
    keyPem:  forge.pki.privateKeyToPem(keyBag.key as any),
  };
}

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  try {
    const body = await req.json();
    const {
      empresa_id,
      cnpj,
      pfx_base64,
      pfx_senha,
      data_inicio,
      data_fim,
      ambiente = "homologacao",
    } = body;

    if (!cnpj || !pfx_base64 || !pfx_senha || !data_inicio || !data_fim) {
      return NextResponse.json(
        { status: "erro", mensagem: "cnpj, pfx_base64, pfx_senha, data_inicio e data_fim sao obrigatorios" },
        { status: 400 }
      );
    }

    let certPem = "";
    let keyPem  = "";
    try {
      const c = carregarCertificado(pfx_base64, pfx_senha);
      certPem = c.certPem;
      keyPem  = c.keyPem;
    } catch (e: any) {
      return NextResponse.json(
        { status: "erro", mensagem: `Certificado A1 invalido: ${e.message}` },
        { status: 400 }
      );
    }

    const base  = BASE_URL[ambiente as keyof typeof BASE_URL];
    const agent = new https.Agent({
      cert: certPem,
      key: keyPem,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      ciphers: [
        "ECDHE-RSA-AES256-GCM-SHA384",
        "ECDHE-RSA-AES128-GCM-SHA256",
        "ECDHE-RSA-AES256-SHA384",
        "ECDHE-RSA-AES128-SHA256",
        "AES256-GCM-SHA384",
        "AES128-GCM-SHA256",
      ].join(":"),
    });

    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const listUrl = `${base}/NFSe?cnpjTomador=${cnpjLimpo}&dataInicio=${data_inicio}&dataFim=${data_fim}&pagina=1`;

    let listRes: Response;
    try {
      listRes = await fetch(listUrl, {
        headers: { Accept: "application/json" },
        // @ts-ignore — Node fetch aceita agent
        agent,
      });
    } catch (e: any) {
      // fetch failed = TLS/DNS/timeout — devolve mensagem clara
      const msg = String(e?.cause?.code ?? e?.code ?? e?.message ?? e);
      return NextResponse.json(
        {
          status: "erro",
          mensagem: `Falha de rede ao chamar ${listUrl}: ${msg}. Verifique se o certificado A1 esta valido, o ambiente (homologacao/producao) e se ha conectividade ao Portal Nacional NFS-e (adn.nfse.gov.br).`,
          url_consultada: listUrl,
          ambiente,
          duracao_ms: Date.now() - inicio,
        },
        { status: 502 }
      );
    }

    if (!listRes.ok) {
      const txt = await listRes.text();
      return NextResponse.json(
        {
          status: "erro",
          mensagem: `Portal Nacional NFS-e respondeu HTTP ${listRes.status}`,
          detalhe: txt.substring(0, 1000),
          url_consultada: listUrl,
          ambiente,
        },
        { status: 502 }
      );
    }

    const lista = await listRes.json();
    const nfses: any[] = lista?.nfse ?? lista?.dados ?? lista?.NFSe ?? lista?.lista ?? [];
    const salvos: string[] = [];
    const erros: string[] = [];

    for (const nfse of nfses) {
      const chave = nfse.chaveAcesso ?? nfse.chaveNFSe ?? nfse.numero ?? String(Math.random());
      try {
        const xmlUrl = `${base}/NFSe/${chave}/xml`;
        const xmlRes = await fetch(xmlUrl, {
          headers: { Accept: "application/xml" },
          // @ts-ignore
          agent,
        });
        if (!xmlRes.ok) {
          erros.push(`${chave}: HTTP ${xmlRes.status}`);
          continue;
        }
        const xml = await xmlRes.text();

        await supabase().from("documentos_fiscais").upsert(
          {
            empresa_id: empresa_id ?? null,
            chave_acesso: `RFB-${chave}`,
            xml,
            schema: "nfse",
            nsu: "",
            sim: "nfse_nacional_poll",
            importado_em: new Date().toISOString(),
          },
          { onConflict: "chave_acesso" }
        );
        salvos.push(chave);
      } catch (e: any) {
        erros.push(`${chave}: ${e.message}`);
      }
    }

    if (empresa_id) {
      await supabase().from("documento_consultas").insert({
        empresa_id,
        tipo: "NFSE_RFB",
        chave_acesso: `${data_inicio}/${data_fim}`,
        origem: "nfse_nacional_poll",
        status: erros.length ? "ERRO" : "OK",
        mensagem: `${salvos.length} salva(s), ${erros.length} erro(s)`,
        payload_resposta: { salvos: salvos.slice(0, 50), erros: erros.slice(0, 50) },
        duracao_ms: Date.now() - inicio,
      });
    }

    return NextResponse.json({
      status: "OK",
      total: salvos.length,
      chaves: salvos,
      erros: erros.slice(0, 50),
      ambiente,
      url_consultada: listUrl,
      duracao_ms: Date.now() - inicio,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "erro", mensagem: String((e as Error).message), stack: (e as Error).stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    descricao: "Polling Portal Nacional NFS-e (Sistema Nacional NFS-e RFB)",
    endpoints: BASE_URL,
    metodo: "POST",
    body: {
      empresa_id: "uuid (opcional)",
      cnpj: "14 digitos",
      pfx_base64: "base64 do .pfx",
      pfx_senha: "senha do .pfx",
      data_inicio: "YYYY-MM-DD",
      data_fim: "YYYY-MM-DD",
      ambiente: "producao | homologacao",
    },
  });
}
