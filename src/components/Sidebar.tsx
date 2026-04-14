"use client";

import { useState, useEffect } from "react";
import { Lang, t } from "@/lib/i18n";
import { AgriSafeLogo } from "@/components/AgriSafeLogo";
import {
  BarChart3, Radar, Newspaper, Calendar,
  PenTool, BookOpen, Scale, Store, Factory,
  LayoutDashboard, ChevronDown, X, Database, Brain, TestTube, HelpCircle,
  PanelLeftClose, PanelLeftOpen, CalendarDays,
} from "lucide-react";

const SIDEBAR_COLLAPSED_KEY = "agsf-sidebar-collapsed";
const SIDEBAR_WIDTH_EXPANDED = "240px";
const SIDEBAR_WIDTH_COLLAPSED = "64px";

export type Module =
  | "dashboard"
  | "dataSources"
  | "market" | "inputs" | "competitors" | "news" | "events"
  | "contentHub"
  | "regulatory" | "recuperacao" | "retailers" | "industries"
  | "meetings"
  | "knowledgeBase"
  | "settings";

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
      { id: "industries", icon: Factory, labelKey: "industries" },
      { id: "meetings", icon: CalendarDays, labelKey: "meetings" },
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
      { id: "dataSources", icon: Database, labelKey: "dataSources" },
      { id: "knowledgeBase", icon: Brain, labelKey: "knowledgeBase" },
    ],
  },
];

export function Sidebar({ lang, activeModule, onModuleChange, mobileOpen, onCloseMobile }: SidebarProps) {
  const tr = t(lang);
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Read persisted collapsed state on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "1") setSidebarCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  // Sync CSS variable so main content and header reflow automatically
  useEffect(() => {
    const w = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
    document.documentElement.style.setProperty("--sidebar-width", w);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [sidebarCollapsed]);

  const toggleSection = (title: string) => {
    setSectionCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleModuleClick = (mod: Module) => {
    onModuleChange(mod);
    onCloseMobile();
  };

  /** Build the sidebar markup. `collapsed` forces icon-only even on mobile. */
  const buildSidebarContent = (collapsed: boolean) => (
    <div className="flex flex-col h-full">
      {/* Logo + collapse toggle */}
      <div className={`${collapsed ? "px-2" : "px-5"} py-5 border-b border-neutral-200 flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2`}>
        {collapsed ? (
          <AgriSafeLogo size={28} />
        ) : (
          <div className="flex items-center gap-3 min-w-0">
            <AgriSafeLogo size={32} />
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold text-neutral-900 leading-tight truncate">AgriSafe</h1>
              <p className="text-[11px] font-medium text-neutral-500 truncate">Market Hub</p>
            </div>
          </div>
        )}
        {/* Desktop-only collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          className={`hidden md:flex items-center justify-center ${collapsed ? "absolute top-5 right-[-14px] bg-white border border-neutral-200 shadow-sm rounded-full w-7 h-7 hover:bg-neutral-50" : "p-1.5 rounded-md hover:bg-[rgba(0,0,0,0.04)]"} text-neutral-500 hover:text-neutral-800 transition-colors`}
          title={collapsed ? (lang === "pt" ? "Expandir sidebar" : "Expand sidebar") : (lang === "pt" ? "Recolher sidebar" : "Collapse sidebar")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 ${collapsed ? "px-2" : "px-3"} py-3 overflow-y-auto overflow-x-hidden`}>
        {/* Dashboard */}
        <button
          onClick={() => handleModuleClick("dashboard")}
          title={collapsed ? tr.nav.dashboard : undefined}
          className={`w-full flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2 rounded-md text-[14px] font-medium transition-all duration-150 ${
            activeModule === "dashboard"
              ? "bg-brand-primary text-white"
              : "text-neutral-800 hover:bg-[rgba(0,0,0,0.04)]"
          }`}
        >
          <LayoutDashboard size={20} className="shrink-0" />
          {!collapsed && <span className="truncate">{tr.nav.dashboard}</span>}
        </button>

        {/* Sections */}
        {sections.map((section) => {
          const sectionKey = section.titleEn;
          const isSecCollapsed = sectionCollapsed[sectionKey];

          return (
            <div key={sectionKey} className={collapsed ? "mt-3" : "mt-5"}>
              {collapsed ? (
                // Thin divider between sections in collapsed mode
                <div className="h-px bg-neutral-200 mx-2 mb-1" />
              ) : (
                <button
                  onClick={() => toggleSection(sectionKey)}
                  className="w-full flex items-center justify-between px-3 py-1 group"
                >
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-[0.05em] truncate">
                    {lang === "pt" ? section.titlePt : section.titleEn}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-neutral-400 transition-transform duration-200 shrink-0 ${isSecCollapsed ? "-rotate-90" : ""}`}
                  />
                </button>
              )}

              {(collapsed || !isSecCollapsed) && (
                <div className="mt-1 space-y-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleModuleClick(item.id)}
                      title={collapsed ? tr.modules[item.labelKey] : undefined}
                      className={`w-full flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2 rounded-md text-[14px] font-medium transition-all duration-150 ${
                        activeModule === item.id
                          ? "bg-brand-primary text-white"
                          : "text-neutral-800 hover:bg-[rgba(0,0,0,0.04)]"
                      }`}
                    >
                      <item.icon
                        size={20}
                        className={`shrink-0 ${activeModule === item.id ? "text-white" : "text-neutral-500"}`}
                      />
                      {!collapsed && <span className="truncate">{tr.modules[item.labelKey]}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Settings — bottom */}
      <div className={`${collapsed ? "px-2" : "px-3"} py-3 border-t border-neutral-200`}>
        <button
          onClick={() => handleModuleClick("settings")}
          title={collapsed ? tr.nav.settings : undefined}
          className={`w-full flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2 rounded-md text-[14px] font-medium transition-all duration-150 ${
            activeModule === "settings"
              ? "bg-brand-primary text-white"
              : "text-neutral-500 hover:bg-[rgba(0,0,0,0.04)] hover:text-neutral-800"
          }`}
        >
          <HelpCircle
            size={20}
            className={`shrink-0 ${activeModule === "settings" ? "text-white" : "text-neutral-400"}`}
          />
          {!collapsed && <span className="truncate">{tr.nav.settings}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className="hidden md:flex bg-[#F5F5F0] border-r border-neutral-200 fixed h-full z-[100] flex-col transition-[width] duration-200 ease-out"
        style={{ width: "var(--sidebar-width)" }}
      >
        {buildSidebarContent(sidebarCollapsed)}
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
            {/* Mobile drawer is always fully expanded */}
            {buildSidebarContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}

export function getModuleTitle(module: Module, lang: Lang): string {
  const tr = t(lang);
  if (module === "dashboard") return tr.nav.dashboard;
  if (module === "settings") return tr.nav.settings;
  const keyMap: Record<Exclude<Module, "dashboard" | "settings">, keyof typeof tr.modules> = {
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
    industries: "industries",
    meetings: "meetings",
    knowledgeBase: "knowledgeBase",
  };
  return tr.modules[keyMap[module]];
}
