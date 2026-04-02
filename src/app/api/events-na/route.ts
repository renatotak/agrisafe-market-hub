import { NextResponse } from "next/server";

export const revalidate = 3600; // cache 1h

const API = "https://api.agroagenda.agr.br/v1";
const IMG_BASE = "https://api.agroagenda.agr.br";

export interface AgroAgendaEvent {
  id: string;
  nome: string;
  dataInicio: string;
  cidade: string | null;
  estado: string | null;
  imagemUrl: string | null;
  tipo: string;
  formato: string;
  slug: string;
  secao?: string;
}

export async function GET() {
  try {
    const res = await fetch(`${API}/home`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`AgroAgenda API returned ${res.status}`);
    const json = await res.json();

    const secoes: { titulo: string; eventos: any[] }[] = json.secoes || [];
    const seen = new Set<string>();
    const events: AgroAgendaEvent[] = [];

    for (const secao of secoes) {
      for (const ev of secao.eventos || []) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        events.push({
          id: ev.id,
          nome: (ev.nome || "").trim(),
          dataInicio: ev.dataInicio || "",
          cidade: ev.cidade?.trim() || null,
          estado: ev.estado?.trim() || null,
          imagemUrl: ev.imagemUrl ? `${IMG_BASE}${ev.imagemUrl}` : null,
          tipo: ev.tipo || "",
          formato: ev.formato || "",
          slug: ev.slug || "",
          secao: secao.titulo,
        });
      }
    }

    // Sort by date ascending, upcoming first
    const today = new Date().toISOString().split("T")[0];
    events.sort((a, b) => {
      const aUp = a.dataInicio >= today ? 0 : 1;
      const bUp = b.dataInicio >= today ? 0 : 1;
      if (aUp !== bUp) return aUp - bUp;
      return a.dataInicio.localeCompare(b.dataInicio);
    });

    return NextResponse.json({
      success: true,
      count: events.length,
      data: events,
      fetched_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("AgroAgenda API error:", err);
    return NextResponse.json({ success: false, error: err.message, data: [] }, { status: 502 });
  }
}
