/**
 * /api/nfse/diagnostico
 *
 * Roda uma sequencia de testes para identificar onde a integracao com o
 * Portal Nacional NFS-e (SNNFS-e ADN) esta falhando.
 *
 * Etapas:
 *   1. Carrega/valida o certificado A1
 *   2. DNS lookup do dominio do ADN
 *   3. TLS handshake (sem cert client) - prova alcance do servidor
 *   4. mTLS handshake (com cert client) - prova autenticacao
 *   5. Chamada de teste GET ?cnpjTomador=... - prova adesao do CNPJ
 *
 * Body:
 *   { empresa_id?, cnpj?, pfx_base64?, pfx_senha?, ambiente? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import https from "https";
import dns from "dns/promises";
import { carregarCertificadoA1 } from "@/lib/sefaz";

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
  producao: "https://adn.nfse.gov.br/contribuinte/v1",
  homologacao: "https://adnh.producaorestrita.nfse.gov.br/contribuinte/v1",
};

interface Etapa {
  nome: string;
  ok: boolean;
  detalhe: string;
  duracao_ms: number;
}

export async function POST(req: NextRequest) {
  const inicio = Date.now();
  const etapas: Etapa[] = [];

  try {
    const body = await req.json();
    let { empresa_id, cnpj, pfx_base64, pfx_senha, ambiente = "homologacao" } = body;

    // Carrega cert da empresa quando nao enviado
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

    if (!pfx_base64 || !pfx_senha) {
      return NextResponse.json(
        {
          status: "erro",
          mensagem: "Certificado A1 ausente. Carregue o .pfx em /captura-sefaz e salve, ou envie pfx_base64+pfx_senha no body.",
        },
        { status: 400 }
      );
    }

    cnpj = String(cnpj ?? "").replace(/\D/g, "");

    const base = BASE_URL[ambiente as keyof typeof BASE_URL];
    const url = new URL(base);
    const host = url.hostname;

    // ── 1. Carrega cert ────────────────────────────────────────────────
    let t0 = Date.now();
    let certPem = "";
    let keyPem = "";
    let subject = "";
    let notAfter: Date | null = null;
    try {
      const c = await carregarCertificadoA1(pfx_base64, pfx_senha);
      certPem = c.certPem;
      keyPem = c.keyPem;
      subject = c.subject;
      notAfter = c.notAfter;
      const expirado = notAfter < new Date();
      etapas.push({
        nome: "1. Validacao do certificado A1",
        ok: !expirado,
        detalhe: expirado
          ? `EXPIRADO em ${notAfter.toLocaleDateString("pt-BR")}. Renove o certificado.`
          : `OK. Subject: ${subject}. Validade: ${notAfter.toLocaleDateString("pt-BR")}`,
        duracao_ms: Date.now() - t0,
      });
      if (expirado) throw new Error("Cert expirado");
    } catch (e: any) {
      etapas.push({
        nome: "1. Validacao do certificado A1",
        ok: false,
        detalhe: `Falha ao carregar cert: ${e.message}. Confira se o arquivo .pfx esta correto e a senha esta certa.`,
        duracao_ms: Date.now() - t0,
      });
      return NextResponse.json({
        status: "erro",
        ambiente,
        host,
        etapas,
        sugestao: "Reenvie o certificado A1 com a senha correta.",
        duracao_ms: Date.now() - inicio,
      });
    }

    // ── 2. DNS lookup ──────────────────────────────────────────────────
    t0 = Date.now();
    try {
      const lookup = await dns.lookup(host);
      etapas.push({
        nome: "2. DNS lookup do ADN",
        ok: true,
        detalhe: `${host} -> ${lookup.address} (IPv${lookup.family})`,
        duracao_ms: Date.now() - t0,
      });
    } catch (e: any) {
      etapas.push({
        nome: "2. DNS lookup do ADN",
        ok: false,
        detalhe: `Nao foi possivel resolver ${host}: ${e.message}. Verifique conectividade da Vercel ate o dominio.`,
        duracao_ms: Date.now() - t0,
      });
      return NextResponse.json({
        status: "erro",
        ambiente,
        host,
        etapas,
        sugestao: `O dominio ${host} nao resolve. Em raros casos a Vercel bloqueia certas chamadas. Tente novamente em alguns minutos.`,
        duracao_ms: Date.now() - inicio,
      });
    }

    // ── 3. TLS handshake sem cert (servidor responde?) ─────────────────
    t0 = Date.now();
    try {
      const res = await fetch(`${base}/`, { method: "GET" });
      etapas.push({
        nome: "3. Conectividade TLS (sem cert)",
        ok: true,
        detalhe: `Servidor respondeu HTTP ${res.status} (esperado 4xx por nao enviar cert). TLS OK.`,
        duracao_ms: Date.now() - t0,
      });
    } catch (e: any) {
      etapas.push({
        nome: "3. Conectividade TLS (sem cert)",
        ok: false,
        detalhe: `Falha TLS: ${e?.cause?.code ?? e.message}`,
        duracao_ms: Date.now() - t0,
      });
    }

    // ── 4. mTLS handshake com cert ─────────────────────────────────────
    t0 = Date.now();
    let mtlsStatus = 0;
    let mtlsBody = "";
    try {
      const agent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: true });
      const res = await fetch(`${base}/NFSe?cnpjTomador=${cnpj || "00000000000191"}&dataInicio=2026-01-01&dataFim=2026-01-02&pagina=1`, {
        method: "GET",
        // @ts-ignore
        agent,
      });
      mtlsStatus = res.status;
      mtlsBody = (await res.text()).substring(0, 500);

      if (mtlsStatus === 200) {
        etapas.push({
          nome: "4. mTLS + adesao do CNPJ ao SNNFS-e",
          ok: true,
          detalhe: `HTTP 200. CNPJ ${cnpj} esta habilitado no Portal Nacional.`,
          duracao_ms: Date.now() - t0,
        });
      } else if (mtlsStatus === 496) {
        etapas.push({
          nome: "4. mTLS + adesao do CNPJ ao SNNFS-e",
          ok: false,
          detalhe: `HTTP 496 (SSL Certificate Required). O cert foi enviado mas o servidor rejeitou. Causa mais provavel: CNPJ nao tem adesao ativa ao SNNFS-e, OU o cert nao e A1 ICP-Brasil padrao Receita.`,
          duracao_ms: Date.now() - t0,
        });
      } else if (mtlsStatus === 401 || mtlsStatus === 403) {
        etapas.push({
          nome: "4. mTLS + adesao do CNPJ ao SNNFS-e",
          ok: false,
          detalhe: `HTTP ${mtlsStatus}. Autenticacao recusada. Procuracao e-CAC para 'Consulta NFS-e' provavelmente ausente. Acesse e-CAC > Procuracoes > Outorgar e adicione o servico.`,
          duracao_ms: Date.now() - t0,
        });
      } else {
        etapas.push({
          nome: "4. mTLS + adesao do CNPJ ao SNNFS-e",
          ok: false,
          detalhe: `HTTP ${mtlsStatus}. Body: ${mtlsBody}`,
          duracao_ms: Date.now() - t0,
        });
      }
    } catch (e: any) {
      etapas.push({
        nome: "4. mTLS + adesao do CNPJ ao SNNFS-e",
        ok: false,
        detalhe: `Falha mTLS: ${e?.cause?.code ?? e.message}`,
        duracao_ms: Date.now() - t0,
      });
    }

    // ── 5. Sumario / sugestao ──────────────────────────────────────────
    const todasOk = etapas.every((e) => e.ok);
    let sugestao = "";
    if (todasOk) {
      sugestao = "Tudo OK! Volte para o Monitor NFS-e Nacional e execute uma busca real.";
    } else if (mtlsStatus === 496) {
      sugestao = `1) Acesse https://www.nfse.gov.br > Login com cert > verifique 'Adesao ao SNNFS-e' do CNPJ ${cnpj}. 2) Se o municipio do prestador nao aderiu ao SNNFS-e, use o conector ABRASF para ele. 3) Confirme que o cert e A1 ICP-Brasil (e-CNPJ ou e-CPF do socio com procuracao).`;
    } else if (mtlsStatus === 401 || mtlsStatus === 403) {
      sugestao = "Configure procuracao e-CAC para o CNPJ do contador acessar dados do CNPJ da empresa.";
    } else {
      sugestao = "Veja o detalhe de cada etapa acima.";
    }

    if (empresa_id) {
      await supabase().from("documento_consultas").insert({
        empresa_id,
        tipo: "STATUS_SERVICO",
        chave_acesso: cnpj,
        origem: "nfse_diagnostico",
        status: todasOk ? "OK" : "ERRO",
        mensagem: todasOk ? "Diagnostico OK" : `Falha em etapa: ${etapas.find((e) => !e.ok)?.nome}`,
        payload_resposta: { etapas },
        duracao_ms: Date.now() - inicio,
      });
    }

    return NextResponse.json({
      status: todasOk ? "OK" : "ERRO",
      ambiente,
      host,
      cnpj,
      cert_subject: subject,
      cert_validade: notAfter?.toISOString() ?? null,
      etapas,
      sugestao,
      duracao_ms: Date.now() - inicio,
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "erro",
        mensagem: (e as Error).message,
        etapas,
        duracao_ms: Date.now() - inicio,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    descricao: "Diagnostico ADN/SNNFS-e: cert + DNS + TLS + mTLS + adesao",
    metodo: "POST",
    body: { empresa_id: "(opt)", cnpj: "(opt, derivado da empresa)", ambiente: "homologacao | producao" },
  });
}
