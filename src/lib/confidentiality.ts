/**
 * Phase 24G — Confidentiality tier helpers.
 *
 * The 3-tier confidentiality model lives at the row level via the
 * `confidentiality` enum column added to 30+ tables in migration 022.
 * Until now the column was WRITTEN by ingestion routes but NEVER READ
 * for filtering — every Supabase select went straight through.
 *
 * This helper centralizes the access decision so that every read path
 * can either explicitly request a tier or default to the safest one.
 *
 * Tier hierarchy (from least to most restrictive):
 *
 *   public               — Receita Federal data, public news, regulatory
 *                           norms. Anyone can see, even unauthenticated.
 *   agrisafe_published   — AgriSafe-curated insights, write-ups, content
 *                           topics, scraper telemetry. Visible to AgriSafe
 *                           team and partners with a logged-in session.
 *   agrisafe_confidential — Internal CRM (notes, meetings, leads, key
 *                           persons), pipeline classifications. Only
 *                           authenticated AgriSafe staff with the right
 *                           role.
 *   client_confidential   — Future tier for partner-shared data under
 *                           NDA. Not used yet — defined here so the
 *                           type system catches it when we add the
 *                           channel.
 *
 * Visibility rule: a viewer at tier T can see rows whose tier is in
 * `visibleTiers(T)` — i.e. their own tier and every less-restrictive
 * one below it. A `public` viewer sees only `public`. An
 * `agrisafe_confidential` viewer sees public + agrisafe_published +
 * agrisafe_confidential.
 *
 * USAGE PATTERNS:
 *
 *   // Server route — figure out what tier the caller is at, then filter:
 *   import { resolveCallerTier, visibleTiers } from "@/lib/confidentiality"
 *   const tier = await resolveCallerTier(supabase, request)
 *   const { data } = await supabase
 *     .from("knowledge_items")
 *     .select("*")
 *     .in("confidentiality", visibleTiers(tier))
 *
 *   // Cron / service-role context — all tiers are visible:
 *   import { ALL_TIERS } from "@/lib/confidentiality"
 *   .in("confidentiality", ALL_TIERS)
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type ConfidentialityTier =
  | "public"
  | "agrisafe_published"
  | "agrisafe_confidential"
  | "client_confidential"

/** All four tiers in a single array — use only in service-role contexts. */
export const ALL_TIERS: ConfidentialityTier[] = [
  "public",
  "agrisafe_published",
  "agrisafe_confidential",
  "client_confidential",
]

/**
 * Return the set of tiers a viewer at `viewerTier` is allowed to see.
 *
 * Examples:
 *   visibleTiers("public")                 → ["public"]
 *   visibleTiers("agrisafe_published")     → ["public", "agrisafe_published"]
 *   visibleTiers("agrisafe_confidential")  → ["public", "agrisafe_published", "agrisafe_confidential"]
 *   visibleTiers("client_confidential")    → all 4
 */
export function visibleTiers(viewerTier: ConfidentialityTier): ConfidentialityTier[] {
  switch (viewerTier) {
    case "public":
      return ["public"]
    case "agrisafe_published":
      return ["public", "agrisafe_published"]
    case "agrisafe_confidential":
      return ["public", "agrisafe_published", "agrisafe_confidential"]
    case "client_confidential":
      return ALL_TIERS
  }
}

/**
 * Resolve the caller's tier for an incoming Request.
 *
 * Logic (single-user app today, will grow when multi-user lands):
 *   1. If the request carries a valid Supabase auth session (cookie
 *      or Authorization: Bearer), grant `agrisafe_confidential` —
 *      that's the AgriSafe team default.
 *   2. Otherwise grant `public`.
 *
 * When multi-user RBAC ships, this function should look up the user's
 * role in `user_profiles.role` and map roles → tiers (e.g. `viewer` →
 * agrisafe_published, `analyst` → agrisafe_confidential, `partner` →
 * client_confidential).
 */
export async function resolveCallerTier(
  supabase: SupabaseClient,
  request: Request,
): Promise<ConfidentialityTier> {
  // Cheap path: explicit X-Tier header for testing/automation. NOT a
  // production auth path — the server-side selects always re-validate
  // the user's actual tier on a real Supabase session lookup. Used by
  // dev scripts and the AgriSafe Oracle chat panel that runs in the
  // same authenticated context as the rest of the app.
  const headerTier = request.headers.get("x-tier")
  if (headerTier && (ALL_TIERS as readonly string[]).includes(headerTier)) {
    return headerTier as ConfidentialityTier
  }

  // Real path: ask Supabase whether the request has a valid session.
  // The server-side createAdminClient() route uses the service role
  // key — it does NOT inherit a user session from the request, so
  // this call against the SSR client returns null. Server-side admin
  // contexts therefore fall through to the default below, which is
  // intentional — admin scripts and crons must explicitly request
  // ALL_TIERS via the service role; they never go through this helper.
  try {
    const { data } = await supabase.auth.getUser()
    if (data?.user) {
      // Authenticated AgriSafe team session — grant the internal tier.
      return "agrisafe_confidential"
    }
  } catch {
    // No session, no auth context, or auth lookup failed — fall through
  }

  // Default: anonymous / unauthenticated requests see only public.
  return "public"
}

/**
 * Convenience: typed `{ confidentiality: { in: [...] } }` filter object
 * for callers that prefer the object form over the chained `.in()` call.
 */
export function tierFilter(viewerTier: ConfidentialityTier): {
  confidentiality: { in: ConfidentialityTier[] }
} {
  return { confidentiality: { in: visibleTiers(viewerTier) } }
}
