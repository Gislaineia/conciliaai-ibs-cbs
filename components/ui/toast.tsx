"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";
interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextType {
  toast: (t: Omit<ToastItem, "id">) => void;
}
const ToastContext = React.createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const toast = (t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 4000);
  };
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {items.map((it) => {
          const Icon =
            it.type === "success" ? CheckCircle2 :
            it.type === "error" ? XCircle :
            it.type === "warning" ? AlertTriangle : Info;
          const colorCls =
            it.type === "success" ? "border-green-500/50 bg-green-50" :
            it.type === "error" ? "border-red-500/50 bg-red-50" :
            it.type === "warning" ? "border-amber-500/50 bg-amber-50" :
            "border-blue-500/50 bg-blue-50";
          return (
            <div
              key={it.id}
              className={cn("rounded-md border p-3 shadow-md flex gap-2 items-start animate-in fade-in slide-in-from-right", colorCls)}
            >
              <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium">{it.title}</div>
                {it.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{it.description}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    return { toast: (_t: Omit<ToastItem, "id">) => { /* no-op fallback */ } };
  }
  return ctx;
}
