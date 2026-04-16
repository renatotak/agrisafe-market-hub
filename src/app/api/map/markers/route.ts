import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";

/**
 * GET /api/map/markers?types=subsidiary_new,news_attached
 *
 * Phase 3 — Painel map completeness.
 *
 * Returns two new marker layers for the dashboard map:
 *
 * 1. `subsidiary_new` — new branches from `cnpj_establishments` created in the
 *    last 30 days that have geocoded coordinates. Each row carries the entity
 *    name, CNPJ, and municipality so the InfoWindow can link to the entity.
 *
 * 2. `news_attached` — entity mentions of type 'news' joined with `agro_news`
 *    and resolved to coordinates via `cnpj_establishments` or `retailer_locations`.
 *    Weighted by recency (last 90 days). Each row carries entity name + headline.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const revalidate = 600; // ISR 10 min

interface SubsidiaryMarker {
  id: string;
  type: "subsidiary_new";
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  cnpj: string;
  cnpj_raiz: string;
  uf: string;
  date: string;
  entity_uid?: string;
}

interface NewsEntityMarker {
  id: string;
  type: "news_attached";
  lat: number;
  lng: number;
  title: string;       // entity name
  subtitle: string;    // news headline
  news_url?: string;
  entity_uid: string;
  uf: string;
  date: string;
}

export async function GET(req: NextRequest) {
  const typesParam = req.nextUrl.searchParams.get("types") || "subsidiary_new,news_attached";
  const types = typesParam.split(",").map(t => t.trim());

  const result: { subsidiary_new: SubsidiaryMarker[]; news_attached: NewsEntityMarker[] } = {
    subsidiary_new: [],
    news_attached: [],
  };

  // ─── 1. Subsidiary markers (new branches, last 30 days) ─────
  if (types.includes("subsidiary_new")) {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: establishments } = await supabaseAdmin
      .from("cnpj_establishments")
      .select("cnpj, cnpj_raiz, razao_social, nome_fantasia, municipio, uf, latitude, longitude, fetched_at")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .gte("fetched_at", cutoff)
      .order("fetched_at", { ascending: false })
      .limit(200);

    if (establishments) {
      // Batch-resolve entity_uids for all cnpj_raiz values
      const uniqueRoots = [...new Set(establishments.map(e => e.cnpj_raiz))];
      const { data: entities } = await supabaseAdmin
        .from("legal_entities")
        .select("entity_uid, tax_id, trade_name")
        .in("tax_id", uniqueRoots);

      const entityMap = new Map<string, { entity_uid: string; trade_name: string | null }>();
      if (entities) {
        for (const e of entities) {
          entityMap.set(e.tax_id, { entity_uid: e.entity_uid, trade_name: e.trade_name });
        }
      }

      for (const est of establishments) {
        const entity = entityMap.get(est.cnpj_raiz);
        result.subsidiary_new.push({
          id: `sub-${est.cnpj}`,
          type: "subsidiary_new",
          lat: Number(est.latitude),
          lng: Number(est.longitude),
          title: est.nome_fantasia || est.razao_social || est.cnpj,
          subtitle: [est.municipio, est.uf].filter(Boolean).join(", "),
          cnpj: est.cnpj,
          cnpj_raiz: est.cnpj_raiz,
          uf: est.uf || "",
          date: est.fetched_at || new Date().toISOString(),
          entity_uid: entity?.entity_uid,
        });
      }
    }
  }

  // ─── 2. News-attached entity markers (last 90 days) ─────────
  if (types.includes("news_attached")) {
    const cutoff90 = new Date(Date.now() - 90 * 86_400_000).toISOString();

    // Step A: Get recent news-type entity mentions
    const { data: mentions } = await supabaseAdmin
      .from("entity_mentions")
      .select("entity_uid, source_id, created_at")
      .eq("source_table", "agro_news")
      .gte("created_at", cutoff90)
      .order("created_at", { ascending: false })
      .limit(300);

    if (mentions && mentions.length > 0) {
      // Step B: Fetch the news articles
      const newsIds = [...new Set(mentions.map(m => m.source_id))];
      const { data: newsRows } = await supabaseAdmin
        .from("agro_news")
        .select("id, title, source_url, published_at")
        .in("id", newsIds.slice(0, 200));

      const newsMap = new Map<string, { title: string; source_url: string | null; published_at: string | null }>();
      if (newsRows) {
        for (const n of newsRows) {
          newsMap.set(String(n.id), { title: n.title, source_url: n.source_url, published_at: n.published_at });
        }
      }

      // Step C: Fetch entity names + coordinates
      const entityUids = [...new Set(mentions.map(m => m.entity_uid))];
      const { data: entitiesData } = await supabaseAdmin
        .from("legal_entities")
        .select("entity_uid, display_name, trade_name, tax_id")
        .in("entity_uid", entityUids.slice(0, 200));

      const entityInfoMap = new Map<string, { name: string; tax_id: string }>();
      if (entitiesData) {
        for (const e of entitiesData) {
          entityInfoMap.set(e.entity_uid, {
            name: e.display_name || e.trade_name || e.tax_id,
            tax_id: e.tax_id,
          });
        }
      }

      // Step D: Resolve coordinates — prefer cnpj_establishments (matriz), fall back to retailer_locations
      const taxIds = [...new Set([...entityInfoMap.values()].map(e => e.tax_id))];

      // From cnpj_establishments: pick matriz (ordem '0001') with coords
      const { data: estCoords } = await supabaseAdmin
        .from("cnpj_establishments")
        .select("cnpj_raiz, latitude, longitude, uf")
        .in("cnpj_raiz", taxIds.slice(0, 200))
        .not("latitude", "is", null)
        .eq("ordem", "0001")
        .limit(200);

      const coordMap = new Map<string, { lat: number; lng: number; uf: string }>();
      if (estCoords) {
        for (const c of estCoords) {
          coordMap.set(c.cnpj_raiz, { lat: Number(c.latitude), lng: Number(c.longitude), uf: c.uf || "" });
        }
      }

      // Fallback: retailer_locations for entities not found in cnpj_establishments
      const missingTaxIds = taxIds.filter(t => !coordMap.has(t));
      if (missingTaxIds.length > 0) {
        const { data: retCoords } = await supabaseAdmin
          .from("retailer_locations")
          .select("cnpj_raiz, latitude, longitude, uf")
          .in("cnpj_raiz", missingTaxIds.slice(0, 200))
          .not("latitude", "is", null)
          .limit(200);

        if (retCoords) {
          for (const c of retCoords) {
            if (!coordMap.has(c.cnpj_raiz)) {
              coordMap.set(c.cnpj_raiz, { lat: Number(c.latitude), lng: Number(c.longitude), uf: c.uf || "" });
            }
          }
        }
      }

      // Step E: Assemble markers — deduplicate by entity_uid+source_id
      const seen = new Set<string>();
      for (const m of mentions) {
        const key = `${m.entity_uid}-${m.source_id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const entity = entityInfoMap.get(m.entity_uid);
        if (!entity) continue;

        const coords = coordMap.get(entity.tax_id);
        if (!coords) continue;

        const news = newsMap.get(m.source_id);
        if (!news) continue;

        result.news_attached.push({
          id: `nea-${m.entity_uid}-${m.source_id}`,
          type: "news_attached",
          lat: coords.lat + (Math.random() - 0.5) * 0.03,
          lng: coords.lng + (Math.random() - 0.5) * 0.03,
          title: entity.name,
          subtitle: news.title,
          news_url: news.source_url || undefined,
          entity_uid: m.entity_uid,
          uf: coords.uf,
          date: news.published_at || m.created_at,
        });
      }
    }
  }

  await logActivity(supabaseAdmin, {
    action: "upsert",
    target_table: "map_markers",
    source: "manual:map_markers",
    source_kind: "manual",
    summary: `Map markers served: ${result.subsidiary_new.length} subsidiaries, ${result.news_attached.length} news-attached`,
    metadata: { subsidiary_count: result.subsidiary_new.length, news_count: result.news_attached.length },
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    subsidiary_new: result.subsidiary_new,
    news_attached: result.news_attached,
  });
}
