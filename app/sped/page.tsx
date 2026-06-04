"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { getEmpresa, listArquivosSped } from "@/lib/storage";
import type { Empresa, ArquivoSped } from "@/types";
import { ChevronRight, FileCode2 } from "lucide-react";

export default function SpedListPage() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [arquivos, setArquivos] = useState<ArquivoSped[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const e = await getEmpresa();
      setEmpresa(e);
      if (e) setArquivos(await listArquivosSped(e.id));
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-muted-foreground">Carregando...</div>;
  if (!empresa) return <div>Cadastre a empresa.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Arquivos SPED</h1>
        <p className="text-sm text-muted-foreground">EFD ICMS/IPI com Bloco N (IBS/CBS) — gerados a partir das apurações fechadas.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4" /> {arquivos.length} arquivo(s)
          </CardTitle>
          <CardDescription>Cada arquivo é o conteúdo .txt pronto para envio via PVA SPED.</CardDescription>
        </CardHeader>
        <CardContent>
          {arquivos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum arquivo. Acesse uma apuração e clique em <strong>Gerar SPED</strong>.
              {" "}<Link href="/apuracao" className="underline">Ir para apurações</Link>
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Período</TH>
                  <TH>Tipo</TH>
                  <TH>Layout</TH>
                  <TH>Hash MD5</TH>
                  <TH>Status</TH>
                  <TH>Gerado em</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {arquivos.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-semibold">{a.periodo}</TD>
                    <TD className="text-xs">
                      <Badge variant={a.tipo_sped === "EFD_CONTRIBUICOES" ? "info" : "secondary"}>
                        {a.tipo_sped === "EFD_CONTRIBUICOES" ? "Contribuições" : "ICMS/IPI"}
                      </Badge>
                    </TD>
                    <TD className="text-xs">v{a.versao_layout}</TD>
                    <TD className="font-mono text-xs">{a.hash_md5?.substring(0, 12)}…</TD>
                    <TD>
                      <Badge variant={
                        a.status === "transmitido" ? "success" :
                        a.status === "rejeitado" ? "destructive" :
                        a.status === "validado" ? "info" : "warning"
                      }>{a.status}</Badge>
                    </TD>
                    <TD className="text-xs">{a.gerado_em ? new Date(a.gerado_em).toLocaleString("pt-BR") : "-"}</TD>
                    <TD>
                      <Link href={`/sped/${a.id}`}>
                        <Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button>
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
