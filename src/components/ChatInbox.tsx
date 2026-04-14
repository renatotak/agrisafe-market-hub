"use client";

/**
 * ChatInbox — per-entity persistent chat surface for Market Hub (HQ side).
 *
 * Mounted inside EntityCrmPanel. Ensures a main thread exists, then renders
 * a compact thread → messages view with Supabase Realtime subscription
 * (postgres_changes on `chat_messages`) so HQ sees rep messages arrive
 * live and can mark-as-read with one click.
 *
 * HQ-side auth: no api-key header → endpoints resolve as `hq`. The same
 * inbox shape will be reused (with api-key + client_id headers) by the
 * App Campo mobile client — hence the indirection through /api/chat/*
 * instead of talking to supabase directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Lang } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  MessageCircle, Loader2, Send, Check, CheckCheck, AlertTriangle, Lock, RefreshCw, Paperclip,
  ChevronDown, ChevronUp,
} from "lucide-react";

interface Thread {
  id: string;
  entity_uid: string;
  topic: string | null;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_hq: number;
  unread_count_rep: number;
}

interface Message {
  id: string;
  thread_id: string;
  entity_uid: string;
  sender_kind: "hq" | "rep" | "bot";
  sender_ref: string;
  sender_name: string | null;
  body: string | null;
  attachment_path: string | null;
  attachment_kind: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  failure_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export function ChatInbox({
  entityUid,
  lang,
  premiumEnabled,
}: {
  entityUid: string;
  lang: Lang;
  premiumEnabled: boolean;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const ensureThread = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_uid: entityUid, display_name: "AgriSafe HQ" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setThread(d.thread);
      return d.thread as Thread;
    } catch (e: any) {
      setErr(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [entityUid]);

  const loadMessages = useCallback(async (threadId: string) => {
    const r = await fetch(`/api/chat/messages?thread_id=${threadId}&limit=100`);
    const d = await r.json();
    if (r.ok) {
      // Endpoint returns newest-first; reverse for bottom-anchored chat UI
      setMessages([...(d.messages as Message[])].reverse());
    }
  }, []);

  // Initial load: ensure thread + pull history
  useEffect(() => {
    (async () => {
      const t = await ensureThread();
      if (t) await loadMessages(t.id);
    })();
  }, [ensureThread, loadMessages]);

  // Realtime subscription — INSERT + UPDATE on this thread's messages
  useEffect(() => {
    if (!thread) return;
    const channel = supabase
      .channel(`chat:${thread.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${thread.id}` },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `thread_id=eq.${thread.id}` },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [thread]);

  // Auto-scroll to newest on update
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // Auto-ack: when HQ opens the inbox, mark unread REP messages as read
  useEffect(() => {
    if (!thread) return;
    const unread = messages.filter((m) => m.sender_kind === "rep" && !m.read_at);
    if (unread.length === 0) return;
    (async () => {
      for (const m of unread) {
        await fetch(`/api/chat/messages?id=${m.id}&action=ack`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "read" }),
        }).catch(() => {});
      }
    })();
  }, [thread, messages]);

  const send = async () => {
    if (!thread || !draft.trim() || sending) return;
    setSending(true);
    setErr(null);
    const body = draft.trim();
    setDraft("");
    try {
      const r = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: thread.id, body, sender_name: "AgriSafe HQ" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      // Realtime will pick it up; no manual append needed, but push now as
      // an optimistic fallback for network blips.
      setMessages((prev) => (prev.some((m) => m.id === d.message.id) ? prev : [...prev, d.message]));
    } catch (e: any) {
      setErr(e.message);
      setDraft(body); // restore on failure
    } finally {
      setSending(false);
    }
  };

  if (!premiumEnabled) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
        <p className="font-bold flex items-center gap-1.5">
          <Lock size={12} /> {lang === "pt" ? "Chat premium" : "Premium chat"}
        </p>
        <p className="mt-1">
          {lang === "pt"
            ? "Este cliente ainda não tem o feature de chat ativo. Marque entity_features.has_chat = true para habilitar."
            : "This client doesn't have chat enabled. Set entity_features.has_chat = true to turn it on."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-purple-50 border-b border-purple-100">
        <div className="flex items-center gap-1.5">
          <MessageCircle size={13} className="text-purple-600" />
          <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
            {lang === "pt" ? "Chat App Campo" : "App Campo Chat"}
          </span>
          {thread?.unread_count_hq && thread.unread_count_hq > 0 ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
              {thread.unread_count_hq}
            </span>
          ) : null}
        </div>
        <button
          onClick={() => thread && loadMessages(thread.id)}
          className="p-1 rounded hover:bg-purple-100 text-purple-600"
          title={lang === "pt" ? "Atualizar" : "Refresh"}
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {err && (
        <div className="m-2 p-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-700 flex items-center gap-1.5">
          <AlertTriangle size={11} /> {err}
        </div>
      )}

      {loading && !thread ? (
        <div className="flex items-center gap-2 text-[11px] text-neutral-400 p-4">
          <Loader2 size={12} className="animate-spin" />
          {lang === "pt" ? "Abrindo thread..." : "Opening thread..."}
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto p-3 space-y-1.5 bg-neutral-50/50">
          {messages.length === 0 ? (
            <p className="text-[11px] text-neutral-400 italic text-center py-6">
              {lang === "pt"
                ? "Nenhuma mensagem ainda. Envie a primeira para o campo."
                : "No messages yet. Send the first one to the field."}
            </p>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} lang={lang} />)
          )}
          <div ref={endRef} />
        </div>
      )}

      <div className="border-t border-neutral-200 p-2">
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            disabled
            title={lang === "pt" ? "Anexos em breve" : "Attachments coming soon"}
            className="p-1.5 text-neutral-300 cursor-not-allowed"
          >
            <Paperclip size={14} />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={lang === "pt" ? "Escreva ao rep..." : "Message the rep..."}
            className="flex-1 text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400 resize-none"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending || !thread}
            className="p-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, lang }: { message: Message; lang: Lang }) {
  const fromHq = message.sender_kind === "hq";
  const ts = new Date(message.created_at).toLocaleTimeString(lang === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(message.created_at).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" });

  const StatusIcon = () => {
    if (!fromHq) return null;
    if (message.status === "failed") return <AlertTriangle size={10} className="text-red-500" />;
    if (message.status === "read") return <CheckCheck size={10} className="text-blue-500" />;
    if (message.status === "delivered") return <CheckCheck size={10} className="text-neutral-400" />;
    if (message.status === "sent") return <Check size={10} className="text-neutral-400" />;
    return <Loader2 size={10} className="animate-spin text-neutral-300" />;
  };

  return (
    <div className={`flex ${fromHq ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-[12px] leading-snug ${
          fromHq
            ? "bg-purple-600 text-white rounded-br-none"
            : "bg-white border border-neutral-200 text-neutral-900 rounded-bl-none"
        }`}
      >
        {!fromHq && message.sender_name && (
          <p className={`text-[10px] font-bold mb-0.5 ${fromHq ? "text-purple-100" : "text-neutral-500"}`}>
            {message.sender_name}
          </p>
        )}
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {message.attachment_path && (
          <p className="mt-1 text-[11px] italic opacity-80 flex items-center gap-1">
            <Paperclip size={10} /> {message.attachment_kind || "anexo"}
          </p>
        )}
        {message.status === "failed" && message.failure_reason && (
          <p className="mt-1 text-[10px] text-red-200">{message.failure_reason}</p>
        )}
        <div className={`flex items-center gap-1 mt-0.5 text-[9px] ${fromHq ? "text-purple-200" : "text-neutral-400"}`}>
          <span>{date} · {ts}</span>
          <StatusIcon />
        </div>
      </div>
    </div>
  );
}
