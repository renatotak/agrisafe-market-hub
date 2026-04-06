import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureLegalEntityUid } from "@/lib/entities";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CACHE_DAYS = 30;

/** Compute CNPJ check digits for base-12 string (root 8 + ordem 4). */
function computeCnpjDv(base12: string): string {
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digits = base12.split("").map(Number);

  const sum1 = digits.reduce((s, d, i) => s + d * weights1[i], 0);
  const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);

  digits.push(d1);
  const sum2 = digits.reduce((s, d, i) => s + d * weights2[i], 0);
  const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);

  return `${d1}${d2}`;
}

/** Build full 14-digit CNPJ for the matriz (headquarters) from 8-digit root. */
function buildMatrizCnpj(cnpjRaiz: string): string {
  const base12 = cnpjRaiz.padStart(8, "0") + "0001";
  const dv = computeCnpjDv(base12);
  return base12 + dv;
}

function parseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

// ─── Multi-source fetcher (BrasilAPI → publica.cnpj.ws → ReceitaWS) ────────

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "AgriSafeMarketHub/1.0", Accept: "application/json" },
  });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) return { ok: false, status: res.status, data: null };
  return { ok: true, status: res.status, data: await res.json() };
}

/** Normalize BrasilAPI response to our standard format. */
function normalizeBrasilApi(d: any) {
  return {
    razao_social: d.razao_social || null,
    natureza_juridica: d.natureza_juridica || null,
    capital_social: d.capital_social ?? null,
    porte: d.porte || null,
    situacao_cadastral: d.descricao_situacao_cadastral || d.situacao_cadastral || null,
    data_situacao_cadastral: parseDate(d.data_situacao_cadastral),
    data_inicio_atividade: parseDate(d.data_inicio_atividade),
    cnae_fiscal: d.cnae_fiscal ? String(d.cnae_fiscal) : null,
    cnae_fiscal_descricao: d.cnae_fiscal_descricao || null,
    opcao_simples: d.opcao_pelo_simples ?? null,
    opcao_mei: d.opcao_pelo_mei ?? null,
    email: d.correio_eletronico || null,
    telefone: d.ddd_telefone_1 ? `(${d.ddd_telefone_1}) ${d.telefone_1 || ""}`.trim() : null,
    qsa: (d.qsa || []).map((s: any) => ({
      nome_socio: s.nome_socio || s.nome,
      qualificacao_socio: s.qualificacao_socio || s.qualificacao,
      data_entrada_sociedade: s.data_entrada_sociedade || s.data_entrada,
      cnpj_cpf_do_socio: s.cnpj_cpf_do_socio || "",
    })),
    cnaes_secundarios: d.cnaes_secundarios || [],
  };
}

/** Normalize publica.cnpj.ws response to our standard format. */
function normalizeCnpjWs(d: any) {
  const est = d.estabelecimento || {};
  const simples = d.simples || {};
  return {
    razao_social: d.razao_social || null,
    natureza_juridica: d.natureza_juridica?.descricao || null,
    capital_social: d.capital_social ? parseFloat(String(d.capital_social).replace(",", ".")) : null,
    porte: d.porte?.descricao || null,
    situacao_cadastral: est.situacao_cadastral || null,
    data_situacao_cadastral: parseDate(est.data_situacao_cadastral),
    data_inicio_atividade: parseDate(est.data_inicio_atividades),
    cnae_fiscal: est.atividade_principal?.id?.replace(/[.-]/g, "") || null,
    cnae_fiscal_descricao: est.atividade_principal?.descricao || null,
    opcao_simples: simples.simples === "Sim" ? true : simples.simples === "Não" ? false : null,
    opcao_mei: simples.mei === "Sim" ? true : simples.mei === "Não" ? false : null,
    email: est.correio_eletronico || null,
    telefone: est.ddd1 && est.telefone1 ? `(${est.ddd1}) ${est.telefone1}` : null,
    qsa: (d.socios || []).map((s: any) => ({
      nome_socio: s.nome || "",
      qualificacao_socio: s.qualificacao?.descricao || "",
      data_entrada_sociedade: s.data_entrada || "",
      cnpj_cpf_do_socio: s.cpf_cnpj || "",
    })),
    cnaes_secundarios: (est.atividades_secundarias || []).map((a: any) => ({
      codigo: a.id ? parseInt(String(a.id).replace(/[.-]/g, ""), 10) : 0,
      descricao: a.descricao || "",
    })),
  };
}

/** Normalize ReceitaWS response to our standard format. */
function normalizeReceitaWs(d: any) {
  return {
    razao_social: d.nome || null,
    natureza_juridica: d.natureza_juridica || null,
    capital_social: d.capital_social ? parseFloat(String(d.capital_social).replace(",", ".")) : null,
    porte: d.porte || null,
    situacao_cadastral: d.situacao || null,
    data_situacao_cadastral: parseDate(d.data_situacao),
    data_inicio_atividade: parseDate(d.abertura),
    cnae_fiscal: d.atividade_principal?.[0]?.code?.replace(/[.-]/g, "") || null,
    cnae_fiscal_descricao: d.atividade_principal?.[0]?.text || null,
    opcao_simples: d.simples?.optante ?? null,
    opcao_mei: d.simples?.mei ?? null,
    email: d.email || null,
    telefone: d.telefone || null,
    qsa: (d.qsa || []).map((s: any) => ({
      nome_socio: s.nome || "",
      qualificacao_socio: s.qual || "",
      data_entrada_sociedade: "",
      cnpj_cpf_do_socio: "",
    })),
    cnaes_secundarios: (d.atividades_secundarias || []).map((a: any) => ({
      codigo: a.code ? parseInt(String(a.code).replace(/[.-]/g, ""), 10) : 0,
      descricao: a.text || "",
    })),
  };
}

async function fetchCompanyData(fullCnpj: string) {
  // Source 1: BrasilAPI
  const brasilApi = await fetchJson(`https://brasilapi.com.br/api/v1/cnpj/${fullCnpj}`);
  if (brasilApi.ok) return { source: "BrasilAPI", ...normalizeBrasilApi(brasilApi.data), raw_response: brasilApi.data };

  // Source 2: publica.cnpj.ws
  const cnpjWs = await fetchJson(`https://publica.cnpj.ws/cnpj/${fullCnpj}`);
  if (cnpjWs.ok) return { source: "CNPJ.ws", ...normalizeCnpjWs(cnpjWs.data), raw_response: cnpjWs.data };

  // Source 3: ReceitaWS
  const receitaWs = await fetchJson(`https://receitaws.com.br/v1/cnpj/${fullCnpj}`);
  if (receitaWs.ok && receitaWs.data?.status !== "ERROR") return { source: "ReceitaWS", ...normalizeReceitaWs(receitaWs.data), raw_response: receitaWs.data };

  return null;
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cnpjRaiz = req.nextUrl.searchParams.get("cnpj_raiz")?.replace(/\D/g, "");
  if (!cnpjRaiz || cnpjRaiz.length < 7 || cnpjRaiz.length > 8) {
    return NextResponse.json({ error: "cnpj_raiz required (8 digits)" }, { status: 400 });
  }
  const root = cnpjRaiz.padStart(8, "0");
  const cacheOnly = req.nextUrl.searchParams.get("cache_only") === "true";

  // Check cache
  const { data: cached } = await supabaseAdmin
    .from("company_enrichment")
    .select("*")
    .eq("cnpj_basico", root)
    .single();

  if (cached) {
    const fetchedAt = new Date(cached.fetched_at);
    const ageMs = Date.now() - fetchedAt.getTime();
    if (ageMs < CACHE_DAYS * 86_400_000) {
      return NextResponse.json({ source: "cache", ...formatResponse(cached) });
    }
  }

  // If cache_only, don't hit external APIs
  if (cacheOnly) {
    if (cached) return NextResponse.json({ source: "cache_stale", ...formatResponse(cached) });
    return NextResponse.json({ source: "none" }, { status: 404 });
  }

  // Fetch from external APIs (3-source fallback)
  const fullCnpj = buildMatrizCnpj(root);
  let result: any;
  try {
    result = await fetchCompanyData(fullCnpj);
  } catch (err: any) {
    if (cached) {
      return NextResponse.json({ source: "cache_stale", ...formatResponse(cached) });
    }
    return NextResponse.json({ error: `Erro ao consultar APIs: ${err.message?.slice(0, 200)}` }, { status: 502 });
  }

  if (!result) {
    if (cached) {
      return NextResponse.json({ source: "cache_stale", ...formatResponse(cached) });
    }
    return NextResponse.json(
      { error: `CNPJ ${fullCnpj} não encontrado em nenhuma fonte pública (BrasilAPI, CNPJ.ws, ReceitaWS)` },
      { status: 404 },
    );
  }

  // Resolve / create the legal_entities row so the enrichment row carries
  // entity_uid (Phase 17 — 5-entity model). Non-fatal if it returns null;
  // the legacy cnpj_basico key still works.
  const entityUid = await ensureLegalEntityUid(supabaseAdmin, root, {
    legalName: result.razao_social,
    displayName: result.razao_social,
  });

  // Upsert cache
  const row = {
    cnpj_basico: root,
    entity_uid: entityUid,
    razao_social: result.razao_social,
    natureza_juridica: result.natureza_juridica,
    capital_social: result.capital_social,
    porte: result.porte,
    situacao_cadastral: result.situacao_cadastral,
    data_situacao_cadastral: result.data_situacao_cadastral,
    data_inicio_atividade: result.data_inicio_atividade,
    cnae_fiscal: result.cnae_fiscal,
    cnae_fiscal_descricao: result.cnae_fiscal_descricao,
    opcao_simples: result.opcao_simples,
    opcao_mei: result.opcao_mei,
    email: result.email,
    telefone: result.telefone,
    qsa: result.qsa,
    cnaes_secundarios: result.cnaes_secundarios,
    raw_response: result.raw_response,
    fetched_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from("company_enrichment")
    .upsert(row, { onConflict: "cnpj_basico" });

  return NextResponse.json({ source: result.source, ...formatResponse(row) });
}

function formatResponse(row: any) {
  return {
    cnpj_basico: row.cnpj_basico,
    razao_social: row.razao_social,
    natureza_juridica: row.natureza_juridica,
    capital_social: row.capital_social,
    porte: row.porte,
    situacao_cadastral: row.situacao_cadastral,
    data_situacao_cadastral: row.data_situacao_cadastral,
    data_inicio_atividade: row.data_inicio_atividade,
    cnae_fiscal: row.cnae_fiscal,
    cnae_fiscal_descricao: row.cnae_fiscal_descricao,
    opcao_simples: row.opcao_simples,
    opcao_mei: row.opcao_mei,
    email: row.email,
    telefone: row.telefone,
    qsa: row.qsa || [],
    cnaes_secundarios: row.cnaes_secundarios || [],
    fetched_at: row.fetched_at,
  };
}
