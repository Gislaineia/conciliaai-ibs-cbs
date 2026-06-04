"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getEscritorio, saveEscritorio } from "@/lib/storage";
import { useApp } from "@/lib/app-context";
import type { EscritorioContabil } from "@/types";
import { Briefcase, Save, Palette } from "lucide-react";

export default function EscritorioPage() {
  const { toast } = useToast();
  const { recarregar } = useApp();
  const [esc, setEsc] = useState<EscritorioContabil>({
    id: "",
    nome: "",
    cnpj: "",
    cor_primaria: "#2563eb",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const e = await getEscritorio();
      if (e) setEsc(e);
    })();
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!esc.nome || !esc.cnpj) {
      toast({ type: "error", title: "Preencha nome e CNPJ" });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveEscritorio(esc);
      setEsc(saved);
      await recarregar();
      toast({ type: "success", title: "Escritório salvo", description: "Branding aplicado." });
    } catch (err) {
      toast({ type: "error", title: "Erro", description: String((err as Error).message) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Briefcase className="h-6 w-6" /> Escritório Contábil — White Label
        </h1>
        <p className="text-sm text-muted-foreground">
          Personalize o sistema com a marca do seu escritório. O cliente final vê como produto seu.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nome do escritório *</Label>
            <Input value={esc.nome} onChange={(e) => setEsc({ ...esc, nome: e.target.value })} />
          </div>
          <div>
            <Label>CNPJ *</Label>
            <Input value={esc.cnpj} onChange={(e) => setEsc({ ...esc, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label>Responsável</Label>
            <Input value={esc.responsavel ?? ""} onChange={(e) => setEsc({ ...esc, responsavel: e.target.value })} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={esc.email ?? ""} onChange={(e) => setEsc({ ...esc, email: e.target.value })} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={esc.telefone ?? ""} onChange={(e) => setEsc({ ...esc, telefone: e.target.value })} />
          </div>
          <div>
            <Label>Slug (subdomínio sugerido)</Label>
            <Input value={esc.slug ?? ""} onChange={(e) => setEsc({ ...esc, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="meu-escritorio" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Branding visual</CardTitle>
          <CardDescription>Logo + cores aparecem na sidebar e nos cabeçalhos do sistema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>URL do logo</Label>
            <Input
              value={esc.logo_url ?? ""}
              onChange={(e) => setEsc({ ...esc, logo_url: e.target.value })}
              placeholder="https://… ou data:image/png;base64,…"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Cole uma URL HTTPS ou um data-URI (PNG/SVG). Tamanho recomendado: 80×80px.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cor primária</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={esc.cor_primaria}
                  onChange={(e) => setEsc({ ...esc, cor_primaria: e.target.value })}
                  className="h-10 w-14 rounded border cursor-pointer"
                />
                <Input
                  value={esc.cor_primaria}
                  onChange={(e) => setEsc({ ...esc, cor_primaria: e.target.value })}
                  placeholder="#2563eb"
                />
              </div>
            </div>
            <div>
              <Label>Cor secundária (opcional)</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={esc.cor_secundaria ?? "#1e40af"}
                  onChange={(e) => setEsc({ ...esc, cor_secundaria: e.target.value })}
                  className="h-10 w-14 rounded border cursor-pointer"
                />
                <Input
                  value={esc.cor_secundaria ?? ""}
                  onChange={(e) => setEsc({ ...esc, cor_secundaria: e.target.value })}
                  placeholder="#1e40af"
                />
              </div>
            </div>
          </div>
          <div className="rounded-md border p-4 mt-2 flex items-center gap-3" style={{ background: esc.cor_primaria + "10" }}>
            <div
              className="h-12 w-12 rounded flex items-center justify-center text-white font-bold text-xl"
              style={{ background: esc.cor_primaria }}
            >
              {(esc.nome || "C").charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold">{esc.nome || "Seu Escritório"}</div>
              <div className="text-xs text-muted-foreground">Pré-visualização do branding</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
