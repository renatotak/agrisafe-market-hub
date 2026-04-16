"use client";

/**
 * Backlog — Ctrl+K / Cmd+K command palette.
 *
 * Keyboard-driven navigation across the 15 modules. Opens on Ctrl+K
 * (Windows/Linux) or Cmd+K (macOS). Arrow keys navigate, Enter selects,
 * Esc closes.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { getModuleTitle, type Module } from "@/components/Sidebar";
import {
  Search, Home, Database, TrendingUp, Leaf, Radar, Newspaper, Calendar,
  FileText, BookOpen, AlertTriangle, Building2, Factory, Landmark,
  Users, Brain, Settings as SettingsIcon, CornerDownLeft,
} from "lucide-react";

interface CommandPaletteProps {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  onNavigate: (module: Module) => void;
}

interface PaletteItem {
  module: Module;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  keywords: string[];
  section: "navigation" | "directories" | "intelligence" | "settings";
}

const PALETTE_ITEMS: PaletteItem[] = [
  { module: "dashboard",             icon: Home,          keywords: ["painel", "home", "overview", "dashboard"], section: "navigation" },
  { module: "market",                icon: TrendingUp,    keywords: ["pulso", "commodities", "prices", "market"], section: "intelligence" },
  { module: "inputs",                icon: Leaf,          keywords: ["insumos", "inputs", "agrofit", "defensivos"], section: "intelligence" },
  { module: "competitors",           icon: Radar,         keywords: ["radar", "competitors", "concorrentes"], section: "intelligence" },
  { module: "news",                  icon: Newspaper,     keywords: ["news", "noticias", "artigos"], section: "intelligence" },
  { module: "events",                icon: Calendar,      keywords: ["events", "eventos", "agenda"], section: "intelligence" },
  { module: "contentHub",            icon: FileText,      keywords: ["content", "conteudo", "linkedin", "articles"], section: "intelligence" },
  { module: "regulatory",            icon: BookOpen,      keywords: ["regulatory", "regulatorio", "leis", "marco"], section: "intelligence" },
  { module: "recuperacao",           icon: AlertTriangle, keywords: ["recuperacao", "judicial", "rj", "falencia"], section: "intelligence" },
  { module: "retailers",             icon: Building2,     keywords: ["canais", "retailers", "channels", "diretorio"], section: "directories" },
  { module: "industries",            icon: Factory,       keywords: ["industries", "industrias", "fabricantes"], section: "directories" },
  { module: "financialInstitutions", icon: Landmark,      keywords: ["financial", "instituicoes", "bancos", "fidc", "fiagro", "sicor"], section: "directories" },
  { module: "meetings",              icon: Users,         keywords: ["meetings", "reunioes", "log"], section: "directories" },
  { module: "knowledgeBase",         icon: Brain,         keywords: ["knowledge", "conhecimento", "oracle", "rag"], section: "intelligence" },
  { module: "dataSources",           icon: Database,      keywords: ["sources", "fontes", "ingest", "scrapers"], section: "settings" },
  { module: "settings",              icon: SettingsIcon,  keywords: ["settings", "config", "ajustes", "ajuda"], section: "settings" },
];

const SECTION_LABELS_PT: Record<PaletteItem["section"], string> = {
  navigation: "Navegação",
  intelligence: "Inteligência",
  directories: "Diretórios",
  settings: "Configuração",
};
const SECTION_LABELS_EN: Record<PaletteItem["section"], string> = {
  navigation: "Navigation",
  intelligence: "Intelligence",
  directories: "Directories",
  settings: "Settings",
};

export function CommandPalette({ lang, open, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build searchable list
  const items = useMemo(
    () => PALETTE_ITEMS.map((it) => ({
      ...it,
      title: getModuleTitle(it.module, lang),
    })),
    [lang],
  );

  // Filter by query
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter((it) =>
      it.title.toLowerCase().includes(q) ||
      it.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [items, query]);

  // Group by section
  const grouped = useMemo(() => {
    const map = new Map<PaletteItem["section"], typeof filtered>();
    for (const it of filtered) {
      if (!map.has(it.section)) map.set(it.section, []);
      map.get(it.section)!.push(it);
    }
    return map;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const list: typeof filtered = [];
    const order: PaletteItem["section"][] = ["navigation", "intelligence", "directories", "settings"];
    for (const section of order) {
      const sectionItems = grouped.get(section);
      if (sectionItems) list.push(...sectionItems);
    }
    return list;
  }, [grouped]);

  // Reset on open + focus input
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Keyboard handlers
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(flatList.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const sel = flatList[highlightedIndex];
        if (sel) {
          onNavigate(sel.module);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatList, highlightedIndex, onNavigate, onClose]);

  if (!open) return null;

  const labels = lang === "pt" ? SECTION_LABELS_PT : SECTION_LABELS_EN;
  const sectionOrder: PaletteItem["section"][] = ["navigation", "intelligence", "directories", "settings"];

  return (
    <div
      className="fixed inset-0 z-[100] bg-neutral-900/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100">
          <Search size={18} className="text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "pt" ? "Buscar módulo, ação ou atalho..." : "Search module, action, or shortcut..."}
            className="flex-1 text-[14px] outline-none bg-transparent placeholder:text-neutral-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 bg-neutral-100 rounded border border-neutral-200">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {flatList.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-neutral-400">
              {lang === "pt" ? "Nenhum resultado." : "No results."}
            </p>
          ) : (
            sectionOrder.map((section) => {
              const sectionItems = grouped.get(section);
              if (!sectionItems || sectionItems.length === 0) return null;
              return (
                <div key={section} className="py-1">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    {labels[section]}
                  </p>
                  {sectionItems.map((item) => {
                    const flatIdx = flatList.indexOf(item);
                    const highlighted = flatIdx === highlightedIndex;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.module}
                        onMouseEnter={() => setHighlightedIndex(flatIdx)}
                        onClick={() => { onNavigate(item.module); onClose(); }}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                          highlighted ? "bg-[#5B7A2F]/10" : "hover:bg-neutral-50"
                        }`}
                      >
                        <Icon size={16} className={highlighted ? "text-[#5B7A2F]" : "text-neutral-500"} />
                        <span className={`flex-1 text-[13px] ${highlighted ? "text-neutral-900 font-medium" : "text-neutral-700"}`}>
                          {item.title}
                        </span>
                        {highlighted && (
                          <CornerDownLeft size={12} className="text-[#5B7A2F]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-100 bg-neutral-50 text-[10px] text-neutral-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-white border border-neutral-200 font-semibold">↑↓</kbd>
              {lang === "pt" ? "navegar" : "navigate"}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-white border border-neutral-200 font-semibold">↵</kbd>
              {lang === "pt" ? "selecionar" : "select"}
            </span>
          </div>
          <span>{flatList.length} {lang === "pt" ? "itens" : "items"}</span>
        </div>
      </div>
    </div>
  );
}
