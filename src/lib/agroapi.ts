/**
 * Embrapa AgroAPI — OAuth2 client + typed helpers
 *
 * Token endpoint follows WSO2 API Manager convention.
 * All APIs share the same bearer token obtained via client_credentials grant.
 */

const TOKEN_URL = "https://api.cnptia.embrapa.br/token";
const API_BASE = "https://api.cnptia.embrapa.br";

let cachedToken: { access_token: string; expires_at: number } | null = null;

/** Exchange consumer key/secret for a Bearer token (cached until expiry). */
export async function getAgroApiToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at - 30_000) {
    return cachedToken.access_token;
  }

  const key = process.env.AGROAPI_CONSUMER_KEY;
  const secret = process.env.AGROAPI_CONSUMER_SECRET;
  if (!key || !secret) throw new Error("AGROAPI_CONSUMER_KEY / AGROAPI_CONSUMER_SECRET not set");

  const credentials = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgroAPI token request failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  cachedToken = {
    access_token: json.access_token,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
  };

  return cachedToken.access_token;
}

/** Authenticated GET request to any AgroAPI endpoint. */
export async function agroApiFetch(path: string, params?: Record<string, string>): Promise<any> {
  const token = await getAgroApiToken();
  const url = new URL(path, API_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgroAPI ${path} failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ─── Shared search helper (AGROFIT + Bioinsumos share the same response schema) ───

export interface AgroProduct {
  numero_registro: string;
  marca_comercial: string[];
  titular_registro: string;
  produto_biologico: boolean;
  classe_categoria_agronomica: string[];
  formulacao: string;
  ingrediente_ativo: string[];
  indicacao_uso: { cultura: string; praga: string }[];
  classificacao_toxicologica: string;
  classificacao_ambiental: string;
  url_agrofit: string;
}

async function searchAgroApi(
  basePath: string,
  query: string,
  page: number,
): Promise<{ data: AgroProduct[]; total: number; pages: number }> {
  const token = await getAgroApiToken();
  const url = new URL(basePath, API_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AgroAPI ${basePath} failed (${res.status}): ${body}`);
  }

  const total = parseInt(res.headers.get("X-Records-Count") || res.headers.get("x-records-count") || "0", 10);
  const pages = parseInt(res.headers.get("X-Pages") || res.headers.get("x-pages") || "1", 10);
  const data = await res.json();

  return { data: Array.isArray(data) ? data : [], total, pages };
}

export function searchAgrofitProducts(query: string, page = 1) {
  return searchAgroApi("/agrofit/v1/search/produtos-formulados", query, page);
}

export function searchBioinsumos(query: string, page = 1) {
  return searchAgroApi("/bioinsumos/v2/search/produtos-biologicos", query, page);
}
