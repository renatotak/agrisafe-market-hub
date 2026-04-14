import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { geocodeAddress } from "@/lib/geocode";
import { logActivity } from "@/lib/activity-log";

/**
 * GET /api/cnpj/establishments?cnpj_raiz=XXXXXXXX
 *
 * Generic on-demand RF establishment fetcher (Phase 24B).
 *
 * Returns the matriz + all filiais for a given 8-digit CNPJ root, sourced
 * from public Receita Federal mirrors. Used by the Diretório de Indústrias
 * expanded panel ("Buscar filiais"), but generic enough that any module
 * can call it for any CNPJ.
 *
 * Strategy:
 *   1. Cache hit → return rows from `cnpj_establishments`
 *   2. Cache miss → iterate ordem 0001..0001+max_iter via BrasilAPI,
 *      stop after `max_consecutive_misses` 404s, upsert each hit, return.
 *
 * Why iterate instead of a "list all" call: no free public API exposes a
 * "give me all establishments for cnpj_raiz X" endpoint. The big dumps
 * are 5-10 GB and need offline ingest. Iterating BrasilAPI ordens is the
 * lightest deterministic path that works today; subsequent calls hit cache.
 *
 * Rate budget: BrasilAPI CNPJ endpoint allows ~30 req/min/IP. We pace at
 * ~2 req/sec and cap at 25 ordens per fetch, so first-touch latency is
 * ~12 s in the worst case. Cached calls return in <100 ms.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CACHE_DAYS = 30;
const MAX_ITER = 25;
const MAX_CONSECUTIVE_MISSES = 4;
const PACE_MS = 500;

function computeCnpjDv(base12: string): string {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d = base12.split("").map(Number);
  const s1 = d.reduce((s, v, i) => s + v * w1[i], 0);
  const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
  d.push(d1);
  const s2 = d.reduce((s, v, i) => s + v * w2[i], 0);
  const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
  return `${d1}${d2}`;
}

function buildCnpj(root8: string, ordem4: string): string {
  const base12 = root8.padStart(8, "0") + ordem4.padStart(4, "0");
  return base12 + computeCnpjDv(base12);
}

function parseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOrdemBrasilApi(fullCnpj: string): Promise<any | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${fullCnpj}`, {
      headers: { "User-Agent": "AgriSafeMarketHub/1.0", Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeBrasilApi(d: any, root8: string) {
  const cnpj14 = String(d.cnpj || "").replace(/\D/g, "");
  return {
    cnpj: cnpj14,
    cnpj_raiz: root8,
    ordem: cnpj14.slice(8, 12),
    matriz_filial: d.identificador_matriz_filial != null ? String(d.identificador_matriz_filial) : null,
    razao_social: d.razao_social || null,
    nome_fantasia: d.nome_fantasia || null,
    situacao_cadastral: d.descricao_situacao_cadastral || (d.situacao_cadastral != null ? String(d.situacao_cadastral) : null),
    data_inicio_atividade: parseDate(d.data_inicio_atividade),
    logradouro: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" ") || null,
    numero: d.numero || null,
    complemento: d.complemento || null,
    bairro: d.bairro || null,
    cep: d.cep ? String(d.cep) : null,
    municipio: d.municipio || null,
    uf: d.uf || null,
    latitude: null,
    longitude: null,
    geo_precision: null,
    email: d.email || null,
    telefone: d.ddd_telefone_1 ? `(${String(d.ddd_telefone_1).slice(0, 2)}) ${String(d.ddd_telefone_1).slice(2)}`.trim() : null,
    source: "BrasilAPI",
    fetched_at: new Date().toISOString(),
    raw_response: d,
  };
}

export async function GET(req: NextRequest) {
  const entityUidParam = req.nextUrl.searchParams.get("entity_uid");
  let cnpjRaizRaw = req.nextUrl.searchParams.get("cnpj_raiz")?.replace(/\D/g, "");

  if (entityUidParam && !cnpjRaizRaw) {
    const { data: entity } = await supabaseAdmin
      .from("legal_entities")
      .select("tax_id")
      .eq("entity_uid", entityUidParam)
      .maybeSingle();
    if (entity?.tax_id) cnpjRaizRaw = entity.tax_id.slice(0, 8);
  }

  if (!cnpjRaizRaw || cnpjRaizRaw.length < 7 || cnpjRaizRaw.length > 8) {
    return NextResponse.json({ error: "cnpj_raiz or entity_uid required" }, { status: 400 });
  }
  const root = cnpjRaizRaw.padStart(8, "0");
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  // ─── 1. Cache check ──────────────────────────────────────────
  const { data: cached } = await supabaseAdmin
    .from("cnpj_establishments")
    .select("*")
    .eq("cnpj_raiz", root)
    .order("ordem", { ascending: true });

  if (!refresh && cached && cached.length > 0) {
    const newest = cached.reduce((acc: any, r: any) => (r.fetched_at > acc ? r.fetched_at : acc), cached[0].fetched_at);
    const ageMs = Date.now() - new Date(newest).getTime();
    if (ageMs < CACHE_DAYS * 86_400_000) {
      return NextResponse.json({ source: "cache", count: cached.length, establishments: cached });
    }
  }

  // ─── 2. On-demand fetch via BrasilAPI + inline geocoding ─────
  // Each successfully fetched establishment is geocoded using the shared
  // 3-tier helper (Google → CEP → Nominatim). Geocoding pacing is folded
  // into the same loop so we never violate Nominatim's 1 req/sec policy.
  const found: any[] = [];
  let consecutiveMisses = 0;

  for (let i = 1; i <= MAX_ITER; i++) {
    const ordem = String(i).padStart(4, "0");
    const fullCnpj = buildCnpj(root, ordem);
    const raw = await fetchOrdemBrasilApi(fullCnpj);

    if (raw && raw.cnpj) {
      consecutiveMisses = 0;
      const row = normalizeBrasilApi(raw, root);

      // Inline geocoding — best-effort, never blocks the row from being saved.
      try {
        const geo = await geocodeAddress({
          logradouro: row.logradouro,
          numero: row.numero,
          bairro: row.bairro,
          cep: row.cep,
          municipio: row.municipio,
          uf: row.uf,
        });
        if (geo) {
          row.latitude = geo.lat as any;
          row.longitude = geo.lng as any;
          row.geo_precision = geo.precision as any;
        }
      } catch {
        // Geocoding failures are non-fatal — row still cached without coords.
      }

      found.push(row);
    } else {
      consecutiveMisses++;
      if (consecutiveMisses >= MAX_CONSECUTIVE_MISSES) break;
    }

    // Pace requests so we stay under BrasilAPI's ~30/min CNPJ limit AND
    // Nominatim's 1 req/sec policy. 1100ms is the safer of the two.
    await sleep(Math.max(PACE_MS, 1100));
  }

  if (found.length === 0) {
    if (cached && cached.length > 0) {
      return NextResponse.json({ source: "cache_stale", count: cached.length, establishments: cached });
    }
    return NextResponse.json(
      { error: `Nenhum estabelecimento encontrado para cnpj_raiz ${root}`, source: "none" },
      { status: 404 },
    );
  }

  // ─── 3. Upsert cache ─────────────────────────────────────────
  const { error: upsertError } = await supabaseAdmin
    .from("cnpj_establishments")
    .upsert(found, { onConflict: "cnpj" });

  if (upsertError) {
    // Non-fatal: still return the rows we fetched
    await logActivity(supabaseAdmin, {
      action: "upsert",
      target_table: "cnpj_establishments",
      target_id: root,
      source: "manual:cnpj_establishments",
      source_kind: "manual",
      summary: `BrasilAPI ${root}: ${found.length} estabelecimento(s) — cache upsert falhou: ${upsertError.message}`.slice(0, 200),
      metadata: { count: found.length, warning: upsertError.message },
    });
    return NextResponse.json({ source: "BrasilAPI", count: found.length, establishments: found, warning: upsertError.message });
  }

  // Phase 24G2 — activity feed (fail-soft)
  const geocoded = found.filter((r) => r.latitude != null && r.longitude != null).length;
  await logActivity(supabaseAdmin, {
    action: "upsert",
    target_table: "cnpj_establishments",
    target_id: root,
    source: "manual:cnpj_establishments",
    source_kind: "manual",
    summary: `BrasilAPI ${root}: ${found.length} estabelecimento(s) sincronizado(s), ${geocoded} geocodificado(s)`,
    metadata: { count: found.length, geocoded, source: "BrasilAPI" },
  });

  return NextResponse.json({ source: "BrasilAPI", count: found.length, establishments: found });
}
