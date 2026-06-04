"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { listEmpresas, deleteEmpresa, getEmpresaAtivaId } from "@/lib/storage";
import { useApp } from "@/lib/app-context";
import type { Empresa } from "@/types";
import { Building, Plus, Trash2, CheckCircle2 } from "lucide-react";

export default function EmpresasPage() {
  const { toast } = useToast();
  const { trocarEmpresa, recarregar } = useApp();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [ativa, setAtiva] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setEmpresas(await listEmpresas());
    setAtiva(getEmpresaAtivaId());
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  async function onDelete(id: string) {
    if (!confirm("Excluir empresa? Documentos e apurações associados serão removidos.")) return;
    await deleteEmpresa(id);
    await recarregar();
    toast({ type: "success", title: "Empresa excluída" });
    reload();
  }

  function ativar(id: string) {
    trocarEmpresa(id);
    setAtiva(id);
    toast({ type: "success", title: "Empresa ativa alterada" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building className="h-6 w-6" /> Empresas
          </h1>
          <p className="text-sm text-muted-foreground">
            Cada empresa cliente do escritório. Selecione a empresa ativa para operar.
          </p>
        </div>
        <Link href="/empresa">
          <Button><Plus className="h-4 w-4" /> Nova empresa</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{empresas.length} empresa(s)</CardTitle>
          <CardDescription>Clique em "Ativar" para trocar o contexto.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : empresas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma empresa. <Link href="/empresa" className="underline">Cadastrar agora</Link>.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Status</TH>
                  <TH>Razão Social</TH>
                  <TH>CNPJ</TH>
                  <TH>UF</TH>
                  <TH>Regime</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {empresas.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      {ativa === e.id ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Ativa
                        </Badge>
                      ) : (
                        <Badge variant="outline">—</Badge>
                      )}
                    </TD>
                    <TD className="font-medium">{e.razao_social}</TD>
                    <TD className="font-mono text-xs">{e.cnpj}</TD>
                    <TD>{e.uf}</TD>
                    <TD>
                      <Badge variant="secondary">{e.regime_tributario.replace(/_/g, " ")}</Badge>
                    </TD>
                    <TD className="flex gap-1">
                      {ativa !== e.id && (
                        <Button variant="outline" size="sm" onClick={() => ativar(e.id)}>
                          Ativar
                        </Button>
                      )}
                      <Link href="/empresa">
                        <Button variant="ghost" size="sm">Editar</Button>
                      </Link>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
