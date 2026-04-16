"use client";

import { useState, useRef, useEffect } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  Send, Loader2, Bot, User, Sparkles, BookOpen,
  Trash2, ExternalLink, X
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface Citation {
  id: string;
  title: string;
  tier: number;
  source_url?: string | null;
  source_type?: string;
  confidentiality?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  context?: Citation[];
}

export interface OracleEntityContext {
  entityName?: string;
  entityId?: string;
  cnpj?: string;
  module?: string;
}

export function OracleChat({ lang, module, entityContext, onClose }: {
  lang: Lang;
  module?: string;
  entityContext?: OracleEntityContext;
  onClose?: () => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/knowledge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: input,
          history: messages.slice(-5), // last 5 for context
          lang: lang,
          module: module,
          entityContext: entityContext || undefined,
        })
      });

      const json = await response.json();
      if (json.success) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: json.answer, 
          context: json.context 
        }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: lang === "pt" 
            ? "Desculpe, ocorreu um erro ao processar sua consulta." 
            : "Sorry, an error occurred while processing your query." 
        }]);
      }
    } catch {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Network error. Please try again." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[700px] bg-white rounded-xl border border-neutral-200 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-neutral-900 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white shadow-lg shadow-brand-primary/20">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white leading-none">Assistente AIA</h3>
            <p className="text-[11px] text-neutral-400 mt-1 uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              {lang === "pt" ? "IA de Inteligência de Mercado" : "Market Intel AI"}
            </p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg text-neutral-400 transition-colors"
          title={lang === "pt" ? "Fechar conversa" : "Close chat"}
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#F9F9F7]"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-neutral-100">
              <Bot size={32} className="text-brand-primary/40" />
            </div>
            <h4 className="text-[18px] font-bold text-neutral-900 mb-2">
              {lang === "pt" ? "Como posso ajudar hoje?" : "How can I help you today?"}
            </h4>
            <p className="text-[13px] text-neutral-500 mb-8">
              {lang === "pt" 
                ? "Consulte nossa Base de Conhecimento sobre crédito rural, mercado de commodities ou recuperação judicial." 
                : "Query our Knowledge Base about rural credit, commodity markets, or judicial recovery."}
            </p>
            
            <div className="grid grid-cols-1 gap-2 w-full">
              {[
                lang === "pt" ? "Quais são as notícias sobre a soja hoje?" : "What's the news about soy today?",
                lang === "pt" ? "Qual o impacto das novas taxas do CMN?" : "What's the impact of new CMN rates?",
                lang === "pt" ? "Resumo das recuperações judiciais recentes" : "Summarize recent judicial recoveries"
              ].map((q, i) => (
                <button 
                  key={i}
                  onClick={() => setInput(q)}
                  className="px-4 py-2 bg-white border border-neutral-200 rounded-lg text-[13px] text-neutral-700 hover:border-brand-primary hover:text-brand-primary transition-all text-left shadow-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                m.role === 'user' 
                  ? 'bg-white text-neutral-400 border-neutral-200' 
                  : 'bg-brand-primary text-white border-brand-primary'
              }`}>
                {m.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
              </div>
              <div className={`max-w-[85%] space-y-2 ${m.role === 'user' ? 'text-right' : ''}`}>
                <div 
                  className={`p-4 rounded-2xl text-[14px] leading-relaxed shadow-sm ${
                    m.role === 'user' 
                      ? 'bg-neutral-900 text-white rounded-tr-none' 
                      : 'bg-white text-neutral-800 border border-neutral-100 rounded-tl-none prose prose-sm max-w-none'
                  }`}
                >
                  {m.content.split('\n').map((line, li) => (
                    <p key={li} className={li > 0 ? "mt-2" : ""}>{line}</p>
                  ))}
                </div>
                
                {/* Citation Chips */}
                {m.context && m.context.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 opacity-90">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase w-full mb-1 flex items-center gap-1">
                      <BookOpen size={10} />
                      {lang === "pt" ? "Fontes citadas:" : "Cited sources:"}
                    </p>
                    {m.context.map((ctx: Citation, ci: number) => {
                      const chip = (
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors ${
                          ctx.source_url
                            ? 'bg-brand-surface/60 border border-brand-primary/20 text-brand-primary hover:bg-brand-surface cursor-pointer'
                            : 'bg-white border border-neutral-200 text-neutral-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            ctx.tier === 1 ? 'bg-brand-primary' :
                            ctx.tier === 2 ? 'bg-info-dark' :
                            ctx.tier === 3 ? 'bg-warning-dark' : 'bg-error-dark'
                          }`} />
                          <span className="max-w-[180px] truncate">{ctx.title}</span>
                          <Badge variant="default" className="px-1 py-0 h-3 text-[8px]">T{ctx.tier}</Badge>
                          {ctx.source_url && <ExternalLink size={9} className="shrink-0" />}
                        </div>
                      );
                      return ctx.source_url ? (
                        <a key={ci} href={ctx.source_url} target="_blank" rel="noopener noreferrer" title={ctx.title}>
                          {chip}
                        </a>
                      ) : (
                        <div key={ci} title={ctx.title}>{chip}</div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        {loading && (
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0 border border-brand-primary">
              <Sparkles size={16} className="animate-pulse" />
            </div>
            <div className="bg-white border border-neutral-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-brand-primary/20 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-brand-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-brand-primary/60 rounded-full animate-bounce" />
              </div>
              <span className="text-[12px] font-medium text-neutral-400 uppercase tracking-wider">Consultando nosso oráculo de dados...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-neutral-100">
        <div className="relative flex items-center gap-2 max-w-4xl mx-auto">
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={lang === "pt" ? "Pergunte à Assistente AIA..." : "Ask the AIA Assistant..."}
            className="flex-1 bg-neutral-100 border-none rounded-xl px-4 py-3 text-[14px] focus:ring-2 focus:ring-brand-primary/20 pr-12 transition-all outline-none"
          />
          <button 
            disabled={!input.trim() || loading}
            onClick={handleSend}
            className={`absolute right-2 p-2 rounded-lg transition-all ${
              input.trim() && !loading 
                ? 'bg-brand-primary text-white shadow-md hover:scale-105' 
                : 'text-neutral-400'
            }`}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-[10px] text-center text-neutral-400 mt-3 flex items-center justify-center gap-1.5">
          <Bot size={12} />
          {lang === "pt" 
            ? "A Assistente AIA pode estar sujeita a imprecisões. Valide informações críticas." 
            : "The AIA Assistant may hallucinate. Always validate critical information."}
        </p>
      </div>
    </div>
  );
}
