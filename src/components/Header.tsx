"use client";

import { Lang } from "@/lib/i18n";
import { Globe, Bell, LogOut, Menu, Search } from "lucide-react";

interface HeaderProps {
  lang: Lang;
  onToggleLang: () => void;
  onLogout: () => void;
  onToggleMobileSidebar: () => void;
  moduleTitle: string;
  moduleSubtitle?: string;
}

export function Header({ lang, onToggleLang, onLogout, onToggleMobileSidebar, moduleTitle, moduleSubtitle }: HeaderProps) {
  return (
    <header className="fixed top-0 right-0 left-0 md:left-[var(--sidebar-width)] h-[var(--header-height)] bg-white border-b border-neutral-200 z-[90] flex items-center justify-between px-4 md:px-8">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="md:hidden p-2 rounded-md text-neutral-600 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={22} />
        </button>
        <div>
          <h1 className="text-[20px] font-bold text-neutral-900 leading-tight">{moduleTitle}</h1>
          {moduleSubtitle && (
            <p className="text-[12px] text-neutral-500">{moduleSubtitle}</p>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {/* Search (desktop) */}
        <div className="hidden lg:flex items-center gap-2 bg-white border border-neutral-300 rounded-md px-3 py-2 mr-2 focus-within:border-brand-primary focus-within:shadow-[0_0_0_3px_rgba(91,122,47,0.12)] transition-all">
          <Search size={16} className="text-neutral-400" />
          <input
            type="text"
            placeholder={lang === "pt" ? "Buscar..." : "Search..."}
            className="bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 outline-none w-48"
          />
        </div>

        {/* Notifications */}
        <button
          className="relative p-2 rounded-md text-neutral-600 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
          aria-label="Notifications"
        >
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
        </button>

        {/* Language */}
        <button
          onClick={onToggleLang}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-neutral-600 hover:bg-[rgba(0,0,0,0.04)] transition-colors"
        >
          <Globe size={18} />
          <span className="hidden sm:inline">{lang === "pt" ? "EN" : "PT"}</span>
        </button>

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full bg-brand-surface text-brand-dark flex items-center justify-center text-[12px] font-semibold ml-1">
          A
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="p-2 rounded-md text-neutral-400 hover:bg-error-light hover:text-error transition-colors ml-1"
          aria-label={lang === "pt" ? "Sair" : "Logout"}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
