"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  getEmpresa, listEmpresas, setEmpresaAtivaId, getEmpresaAtivaId, getEscritorio,
  saveEscritorio,
} from "@/lib/storage";
import type { Empresa, EscritorioContabil } from "@/types";

const ESCRITORIO_DEFAULT: Omit<EscritorioContabil, "id"> = {
  nome: "Escritorio Contabil Bazaga",
  cnpj: "",
  responsavel: "Gislaine Araujo",
  cor_primaria: "#2563eb",
  slug: "bazaga",
};

interface AppContextType {
  empresa: Empresa | null;
  empresas: Empresa[];
  escritorio: EscritorioContabil | null;
  trocarEmpresa: (id: string) => void;
  recarregar: () => Promise<void>;
  carregando: boolean;
}

const AppContext = React.createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [empresa, setEmpresa] = React.useState<Empresa | null>(null);
  const [empresas, setEmpresas] = React.useState<Empresa[]>([]);
  const [escritorio, setEscritorio] = React.useState<EscritorioContabil | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  const recarregar = React.useCallback(async () => {
    setCarregando(true);
    try {
      let es = await getEscritorio();
      // Pré-popular escritório default na primeira execução
      if (!es) {
        es = await saveEscritorio({ ...ESCRITORIO_DEFAULT, id: "" });
      }
      const [list, e] = await Promise.all([listEmpresas(), getEmpresa()]);
      setEscritorio(es);
      setEmpresas(list);
      setEmpresa(e);
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => { recarregar(); }, [recarregar]);

  // Aplica branding white label como CSS variables
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (escritorio?.cor_primaria) {
      // converte hex -> hsl-like? simpler: usar cor direta via override
      root.style.setProperty("--brand-primary", escritorio.cor_primaria);
    } else {
      root.style.removeProperty("--brand-primary");
    }
  }, [escritorio?.cor_primaria]);

  const trocarEmpresa = React.useCallback((id: string) => {
    setEmpresaAtivaId(id);
    recarregar().then(() => {
      router.refresh();
    });
  }, [recarregar, router]);

  return (
    <AppContext.Provider value={{ empresa, empresas, escritorio, trocarEmpresa, recarregar, carregando }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = React.useContext(AppContext);
  if (!ctx) {
    return {
      empresa: null,
      empresas: [],
      escritorio: null,
      trocarEmpresa: () => {},
      recarregar: async () => {},
      carregando: true,
    };
  }
  return ctx;
}
