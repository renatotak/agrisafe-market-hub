"use client";

import { useState } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  Download, BarChart3, TestTube, Radar, Newspaper, Calendar, Store,
  PenTool, BookOpen, Scale, Database, Brain, LayoutDashboard,
  Shield, Server, Workflow, ArrowRight, Puzzle, Copy, Check, FileText,
  Folder, Settings as SettingsIcon, Play,
} from "lucide-react";

const EXTENSION_FOLDER_PATH = "chrome-extensions/reading-room";
const CHROME_EXTENSIONS_URL = "chrome://extensions";

const APP_VERSION = "1.0.0";

const FLOW_STEPS = [
  { key: "flowIngest" as const, icon: Download, color: "bg-blue-500" },
  { key: "flowAnalyze" as const, icon: BarChart3, color: "bg-amber-500" },
  { key: "flowCreate" as const, icon: PenTool, color: "bg-brand-primary" },
  { key: "flowComply" as const, icon: Shield, color: "bg-purple-500" },
];

const MODULE_LIST = [
  { key: "modDashboard" as const, icon: LayoutDashboard },
  { key: "modMarket" as const, icon: BarChart3 },
  { key: "modInputs" as const, icon: TestTube },
  { key: "modCompetitors" as const, icon: Radar },
  { key: "modNews" as const, icon: Newspaper },
  { key: "modEvents" as const, icon: Calendar },
  { key: "modRetailers" as const, icon: Store },
  { key: "modContent" as const, icon: PenTool },
  { key: "modRegulatory" as const, icon: BookOpen },
  { key: "modRecuperacao" as const, icon: Scale },
  { key: "modDataSources" as const, icon: Database },
  { key: "modKnowledge" as const, icon: Brain },
];

function CopyableCode({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API requires HTTPS in some browsers; ignore silently
    }
  };
  return (
    <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-md px-3 py-2 font-mono text-[12px] text-neutral-700">
      <code className="flex-1 truncate">{text}</code>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-brand-primary transition-colors shrink-0"
        title={label || "Copy"}
      >
        {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
        {copied ? "Copied" : label || "Copy"}
      </button>
    </div>
  );
}

export function Settings({ lang }: { lang: Lang }) {
  const tr = t(lang).settings;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h2 className="text-[22px] font-bold text-neutral-900">{tr.title}</h2>
        <p className="text-[14px] text-neutral-500 mt-1">{tr.subtitle}</p>
      </div>

      {/* About card */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-[17px] font-bold text-neutral-900 mb-3">{tr.aboutTitle}</h3>
        <p className="text-[14px] text-neutral-700 leading-relaxed">{tr.aboutDescription}</p>
      </div>

      {/* Platform Flow — Ingest > Analyze > Create > Comply */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-2 mb-5">
          <Workflow size={18} className="text-brand-primary" />
          <h3 className="text-[17px] font-bold text-neutral-900">{tr.platformFlow}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FLOW_STEPS.map((step, i) => {
            const label = tr[step.key] as string;
            const desc = tr[`${step.key}Desc` as keyof typeof tr] as string;
            return (
              <div key={step.key} className="relative">
                <div className="rounded-lg border border-neutral-200 p-4 h-full hover:border-brand-primary/30 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-md ${step.color} flex items-center justify-center`}>
                      <step.icon size={15} className="text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                      {i + 1}.
                    </span>
                    <span className="text-[14px] font-bold text-neutral-900">{label}</span>
                  </div>
                  <p className="text-[12px] text-neutral-600 leading-relaxed">{desc}</p>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight size={14} className="text-neutral-300" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modules */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-[17px] font-bold text-neutral-900 mb-4">{tr.modulesTitle}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MODULE_LIST.map((mod) => {
            const text = tr[mod.key] as string;
            const dashIdx = text.indexOf("\u2014");
            const name = dashIdx > -1 ? text.slice(0, dashIdx).trim() : text;
            const desc = dashIdx > -1 ? text.slice(dashIdx + 1).trim() : "";
            return (
              <div
                key={mod.key}
                className="flex gap-3 items-start rounded-md border border-neutral-100 p-3 hover:border-neutral-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-md bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <mod.icon size={16} className="text-neutral-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-neutral-900">{name}</p>
                  {desc && <p className="text-[12px] text-neutral-500 leading-relaxed mt-0.5">{desc}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reading Room Chrome extension install guide (Phase 22 follow-up) */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-md bg-brand-primary/10 flex items-center justify-center">
              <Puzzle size={18} className="text-brand-primary" />
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-neutral-900">{tr.extTitle}</h3>
              <p className="text-[12px] text-neutral-500 mt-0.5">{tr.extSubtitle}</p>
            </div>
          </div>
          <a
            href="https://github.com/renatotak/agsf_mkthub/tree/main/chrome-extensions/reading-room"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-brand-primary border border-brand-primary rounded-md hover:bg-brand-primary/5 transition-colors shrink-0"
          >
            <FileText size={12} />
            {tr.extReadDocs}
          </a>
        </div>

        {/* Why install — quick value bullets */}
        <div className="bg-brand-surface/30 border border-brand-primary/15 rounded-md p-4 mb-5">
          <p className="text-[11px] font-bold text-brand-primary uppercase tracking-wider mb-2">
            {tr.extWhyTitle}
          </p>
          <ul className="space-y-1.5">
            {[tr.extWhy1, tr.extWhy2, tr.extWhy3].map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-700 leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-[6px] shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Where it lives */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-2">
            <Folder size={13} className="text-neutral-500" />
            <p className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
              {tr.extLocationTitle}
            </p>
          </div>
          <p className="text-[12px] text-neutral-600 mb-2">{tr.extLocationDesc}</p>
          <CopyableCode text={EXTENSION_FOLDER_PATH} />
        </div>

        {/* Step 1 — Install */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Download size={13} className="text-brand-primary" />
            <p className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider">
              {tr.extInstallTitle}
            </p>
          </div>
          <ol className="space-y-3">
            {[
              { title: tr.extStep1Title, desc: tr.extStep1Desc, code: CHROME_EXTENSIONS_URL },
              { title: tr.extStep2Title, desc: tr.extStep2Desc },
              { title: tr.extStep3Title, desc: tr.extStep3Desc },
              { title: tr.extStep4Title, desc: tr.extStep4Desc },
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-neutral-900">{step.title}</p>
                  <p className="text-[12px] text-neutral-600 leading-relaxed mt-0.5">{step.desc}</p>
                  {step.code && (
                    <div className="mt-2">
                      <CopyableCode text={step.code} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Step 2 — Configure */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-3">
            <SettingsIcon size={13} className="text-brand-primary" />
            <p className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider">
              {tr.extConfigTitle}
            </p>
          </div>
          <ol className="space-y-2">
            {[tr.extConfigStep1, tr.extConfigStep2, tr.extConfigStep3, tr.extConfigStep4, tr.extConfigStep5].map((line, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                  {i + 1}
                </div>
                <p className="text-[12px] text-neutral-700 leading-relaxed flex-1">{line}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Daily usage */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Play size={13} className="text-brand-primary" />
            <p className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider">
              {tr.extUsageTitle}
            </p>
          </div>
          <ol className="space-y-2">
            {[tr.extUsage1, tr.extUsage2, tr.extUsage3].map((line, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                  {i + 1}
                </div>
                <p className="text-[12px] text-neutral-700 leading-relaxed flex-1">{line}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Data & Privacy */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-brand-primary" />
          <h3 className="text-[17px] font-bold text-neutral-900">{tr.dataTitle}</h3>
        </div>
        <ul className="space-y-2.5">
          {([
            "dataPublicOnly",
            "dataSources",
            "dataCron",
            "dataLiveApis",
          ] as const).map((key) => (
            <li key={key} className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-[7px] shrink-0" />
              <span className="text-[13px] text-neutral-700 leading-relaxed">{tr[key]}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Tech Stack + Version */}
      <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-2 mb-3">
          <Server size={18} className="text-neutral-500" />
          <h3 className="text-[17px] font-bold text-neutral-900">{tr.techTitle}</h3>
        </div>
        <p className="text-[13px] text-neutral-600 font-mono bg-neutral-50 rounded-md px-3 py-2 border border-neutral-100">
          {tr.techStack}
        </p>
        <p className="text-[12px] text-neutral-400 mt-3">
          {tr.version} {APP_VERSION} &middot; &copy; {new Date().getFullYear()} AgriSafe
        </p>
      </div>
    </div>
  );
}
