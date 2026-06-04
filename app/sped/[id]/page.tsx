"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { getArquivoSped } from "@/lib/storage";
import { validarSped } from "@/lib/sped-generator";
import type { ArquivoSped } from "@/types";

export default function SpedDetalhe() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [arq, setArq] = useState<ArquivoSped | null>(null);
  const [loading, setLoading] = useState(true);
  const [validacao, setValidacao] = useState<{ ok: boolean; erros: { linha: number; mensagem: string }[] } | null>(null);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      const a = await getArquivoSped(params.id);
      setArq(a);
      setLoading(false);
    })();
  }, [params.id]);

  const stats = useMemo(() => {
    if (!arq) return { total: 0, blocos: {} as Record<string, number> };
    const linhas = (arq.conteudo_txt ?? "").split(/\r?\n/).filter((l) => l.length > 0);
    const blocos: Record<string, number> = {};
    for (const l of linhas) {
      const m = l.match(/^\|([0-9A-Z]+)\|/);
      if (m) {
        const b = m[1].charAt(0);
        blocos[b] = (blocos[b] ?? 0) + 1;
      }
    }
    return { total: linhas.length, blocos };
  }, [arq]);

  function download() {
    if (!arq) return;
    const blob = new Blob([arq.conteudo_txt ?? ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SPED_${arq.periodo}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function validar() {
    if (!arq) return;
    const v = validarSped(arq.conteudo_txt ?? "");
    setValidacao(v);
    toast({
      type: v.ok ? "success" : "warning",
      title: v.ok ? "Estrutura válida" : `${v.erros.length} aviso(s)`,
    });
  }

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!arq) return <div>Arquivo não encontrado.</div>;

  const linhas = (arq.conteudo_txt ?? "").split(/\r?\n/);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/sped"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">SPED {arq.periodo}</h1>
            <p className="text-sm text-muted-foreground">{arq.tipo_sped} v{arq.versao_layout}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={validar}><ShieldCheck className="h-4 w-4" /> Validar</Button>
          <Button onClick={download}><Download className="h-4 w-4" /> Baixar .txt</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
        <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Total linhas</div><div className="font-mono font-semibold">{stats.total}</div></div>
        {["0", "C", "D", "G", "H", "N", "9"].map((b) => (
          <div key={b} className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Bloco {b}</div>
            <div className="font-mono font-semibold">{stats.blocos[b] ?? 0}</div>
          </div>
        ))}
      </div>

      {validacao && (
        <Card className={validacao.ok ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}>
          <CardContent className="pt-5">
            <div className="font-medium text-sm">
              {validacao.ok ? "Estrutura básica OK" : `${validacao.erros.length} aviso(s) de layout`}
            </div>
            {validacao.erros.length > 0 && (
              <ul className="mt-2 text-xs space-y-1 max-h-40 overflow-auto">
                {validacao.erros.map((e, i) => (
                  <li key={i}>Linha {e.linha}: {e.mensagem}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Preview do arquivo</CardTitle>
          <CardDescription>Pipe-delimited · {linhas.length} linha(s) · MD5 {arq.hash_md5}</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted/40 rounded-md p-3 overflow-auto text-xs font-mono leading-relaxed max-h-[500px]">
            {linhas.map((l, i) => {
              const m = l.match(/^\|([0-9A-Z]+)\|/);
              const reg = m ? m[1] : "";
              const blocoColor =
                reg.startsWith("0") ? "text-blue-700" :
                reg.startsWith("C") ? "text-green-700" :
                reg.startsWith("D") ? "text-purple-700" :
                reg.startsWith("N") ? "text-red-700" :
                reg.startsWith("9") ? "text-gray-600" : "text-foreground";
              return (
                <div key={i} className={blocoColor}>
                  <span className="text-muted-foreground inline-block w-12 select-none">{i + 1}</span>
                  {l}
                </div>
              );
            })}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
