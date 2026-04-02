"use client";

import { useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { AgriSafeLogo } from "@/components/AgriSafeLogo";
import {
  BarChart3, Radar, Newspaper, Calendar,
  PenTool, BookOpen, Scale, Store,
  LayoutDashboard, ChevronDown, X, Database, Brain, TestTube
} from "lucide-react";

export type Module =
  | "dashboard"
  | "dataSources"
  | "market" | "inputs" | "competitors" | "news" | "events"
  | "contentHub"
  | "regulatory" | "recuperacao" | "retailers"
  | "knowledgeBase";

interface SidebarProps {
  lang: Lang;
  activeModule: Module;
  onModuleChange: (mod: Module) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface SidebarSection {
  titlePt: string;
  titleEn: string;
  icon: string;
  items: { id: Module; icon: React.ComponentType<{ size?: number; className?: string }>; labelKey: keyof ReturnType<typeof t>["modules"] }[];
}

const sections: SidebarSection[] = [
  {
    titlePt: "Ingest\u00e3o de Dados",
    titleEn: "Data Ingestion",
    icon: "cloud_sync",
    items: [
      { id: "dataSources", icon: Database, labelKey: "dataSources" },
    ],
  },
  {
    titlePt: "Intelig\u00eancia de Mercado",
    titleEn: "Market Intelligence",
    icon: "insights",
    items: [
      { id: "market", icon: BarChart3, labelKey: "marketPulse" },
      { id: "inputs", icon: TestTube, labelKey: "inputs" },
      { id: "competitors", icon: Radar, labelKey: "competitors" },
      { id: "news", icon: Newspaper, labelKey: "news" },
      { id: "events", icon: Calendar, labelKey: "events" },
      { id: "retailers", icon: Store, labelKey: "retailers" },
    ],
  },
  {
    titlePt: "Marketing & Conte\u00fado",
    titleEn: "Marketing & Content",
    icon: "campaign",
    items: [
      { id: "contentHub", icon: PenTool, labelKey: "contentHub" },
    ],
  },
  {
    titlePt: "Regulat\u00f3rio",
    titleEn: "Regulatory",
    icon: "policy",
    items: [
      { id: "regulatory", icon: BookOpen, labelKey: "regulatory" },
      { id: "recuperacao", icon: Scale, labelKey: "recuperacao" },
    ],
  },
  {
    titlePt: "Conhecimento",
    titleEn: "Knowledge",
    icon: "psychology",
    items: [
      { id: "knowledgeBase", icon: Brain, labelKey: "knowledgeBase" },
    ],
  },
];

export function Sidebar({ lang, activeModule, onModuleChange, mobileOpen, onCloseMobile }: SidebarProps) {
  const tr = t(lang);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleModuleClick = (mod: Module) => {
    onModuleChange(mod);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <AgriSafeLogo size={32} />
          <div>
            <h1 className="text-[15px] font-bold text-neutral-900 leading-tight">AgriSafe</h1>
            <p className="text-[11px] font-medium text-neutral-500">Market Hub</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {/* Dashboard */}
        <button
          onClick={() => handleModuleClick("dashboard")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium transition-all duration-150 ${
            activeModule === "dashboard"
              ? "bg-brand-primary text-white"
              : "text-neutral-800 hover:bg-[rgba(0,0,0,0.04)]"
          }`}
        >
          <LayoutDashboard size={20} />
          {tr.nav.dashboard}
        </button>

        {/* Sections */}
        {sections.map((section) => {
          const sectionKey = section.titleEn;
          const isCollapsed = collapsed[sectionKey];

          return (
            <div key={sectionKey} className="mt-5">
              <button
                onClick={() => toggleSection(sectionKey)}
                className="w-full flex items-center justify-between px-3 py-1 group"
              >
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em]">
                  {lang === "pt" ? section.titlePt : section.titleEn}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-neutral-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                />
              </button>

              {!isCollapsed && (
                <div className="mt-1 space-y-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleModuleClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium transition-all duration-150 ${
                        activeModule === item.id
                          ? "bg-brand-primary text-white"
                          : "text-neutral-800 hover:bg-[rgba(0,0,0,0.04)]"
                      }`}
                    >
                      <item.icon
                        size={20}
                        className={activeModule === item.id ? "text-white" : "text-neutral-500"}
                      />
                      {tr.modules[item.labelKey]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex w-[var(--sidebar-width)] bg-[#F5F5F0] border-r border-neutral-200 fixed h-full z-[100] flex-col">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/30" onClick={onCloseMobile} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-[#F5F5F0] shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <AgriSafeLogo size={24} />
                <span className="text-sm font-bold text-neutral-900">AgriSafe</span>
              </div>
              <button onClick={onCloseMobile} className="p-1.5 rounded-md hover:bg-[rgba(0,0,0,0.04)] text-neutral-500">
                <X size={20} />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

export function getModuleTitle(module: Module, lang: Lang): string {
  const tr = t(lang);
  if (module === "dashboard") return tr.nav.dashboard;
  const keyMap: Record<Exclude<Module, "dashboard">, keyof typeof tr.modules> = {
    dataSources: "dataSources",
    market: "marketPulse",
    inputs: "inputs",
    competitors: "competitors",
    news: "news",
    events: "events",
    contentHub: "contentHub",
    regulatory: "regulatory",
    recuperacao: "recuperacao",
    retailers: "retailers",
    knowledgeBase: "knowledgeBase",
  };
  return tr.modules[keyMap[module]];
}
