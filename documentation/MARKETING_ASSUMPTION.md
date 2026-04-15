# Marketing Assumption — Monetization Rationale for AgriSafe Market Hub

> Written 2026-04-14. Hypothesis-grade thinking, not a market study. Numbers are anchors for negotiation, not promises.
> Status snapshot: ~9,818 legal entities · 9,328 retailers · 274 industries · 131 RJ cases · 800 AGROFIT products · 340 meetings · 203 news articles · daily briefings · 5-entity model · tier-aware confidentiality already in code.

---

## 1. The Asset (what's actually commercializable)

The Market Hub today is **not** a product. It is **proprietary infrastructure** with five distinct asset types, each with a different buyer:

| Asset | What we have | Why someone pays for it |
|---|---|---|
| **Channel directory** | 9,328 retailers + 24,275 geocoded locations + 274 industries + cross-refs (RJ, news, mentions) | Industries need this to plan distribution; competitors hand-build it from scratch |
| **Distress signals** | RJ cross-referenced with retailers (R$ 582.6M exposure flagged via `v_retailers_in_rj`) + price anomaly detection | Banks, FIDCs, suppliers underwriting credit decisions |
| **Regulatory pulse** | 16+ norms classified by CNAE with "X empresas afetadas" + `affected_cnaes` GIN | Compliance teams at industries, retailers, FIs |
| **Field-sales operating system** | Meeting CRM (340 imports), App Campo agenda sync, persistent chat, similar-targets engine | Industry sales teams, large retailer commercial leadership |
| **AgriSafe Oracle (planned)** | Vertex AI conversational layer over the entire knowledge base, page-context-aware | Anyone who needs decision-support without leaving their workflow |

**The moat is the entity model + cross-references**, not the AI layer. Anyone with $50k of OpenAI credits can build a chatbot. **Nobody else has** the 5-entity graph that lets you ask "which retailers in MT are concentrated with industries that just had a regulatory CNAE shift?" and get a deterministic answer in <300ms.

The AI layer is the **delivery channel**, not the moat.

---

## 2. Buyer Personas & Willingness to Pay (WTP)

Ordered by WTP per account, top to bottom.

### 2.1. Financial Institutions (FIDCs, FIAGROs, agro banks, cooperative banks)

- **Pain:** Underwriting agribusiness credit blind to distress + concentration. Today they read news manually.
- **What they buy:** RJ alerts, CNAE-aware counterparty lookups, retailer×industry concentration map, financial-institution-of-record cross-refs.
- **WTP:** **R$ 8k–80k/month per institution** depending on AUM + counterparty count.
- **Sales motion:** Top-down — Head of Credit / Head of Risk. 3-6 month sales cycle.
- **Status:** Financial Institutions Directory is on roadmap, not built. **Highest single-account WTP, longest cycle.**

### 2.2. Industries (Syngenta, BASF, Bayer, FMC, UPL, Corteva, etc.)

- **Pain:** Channel intelligence — who distributes their products, in which regions, what share. Today bought from Kynetec at R$ 200k+/year.
- **What they buy:** Diretório de Canais (filtered by their product family) + retailer health scores + competitor presence maps + meeting analytics on territory reps.
- **WTP:** **R$ 5k–30k/month per industry**, possibly higher for the top 5.
- **Sales motion:** Mid-funnel — Head of Marketing or Head of Comercial / Field Force. 2-4 month cycle.
- **Status:** Diretório de Indústrias built. 274 industries (vs Kynetec's 256 in our import — we already overlap heavily). Per-culture canonical-stack view (in roadmap) closes the gap.

### 2.3. Large Retailers / Cooperatives (Lavoro, Agrogalaxy, Coamo, Agrosema, etc.)

- **Pain:** Competitive intelligence — who else operates in their territory, where the white space is, which industries to negotiate with.
- **What they buy:** Diretório (their region only), Pulso de Mercado, competitor mentions in news, regulatory alerts for their CNAE.
- **WTP:** **R$ 1.5k–8k/month per retailer.**
- **Sales motion:** Mid-funnel — Diretor Comercial / Diretor de Compras. 1-2 month cycle.
- **Status:** Most data already there. Need: territory-scoped views, multi-user RBAC.

### 2.4. Cooperatives (Sicredi, Sicoob, Ailos, Cresol agencies)

- **Pain:** Member intelligence — which members are at risk, which are growing, which need new products.
- **What they buy:** Member-scoped Diretório + RJ alerts + news mentions + market pulse.
- **WTP:** **R$ 800–3k/month per agency, scaling to R$ 30k+/month for HQ.**
- **Sales motion:** Bottom-up via central + agency-level expansion.
- **Status:** Once Financial Institutions Directory ships, cooperatives are addressable.

### 2.5. Consultancies, M&A advisors, equity researchers

- **Pain:** One-off deep-dives on agribusiness companies / sectors. Today done with Excel + Bloomberg + reading court filings manually.
- **What they buy:** API access OR one-off custom reports.
- **WTP:** **R$ 5k–25k per report**, or **R$ 10k–50k/month for API tier.**
- **Sales motion:** Project-based + word-of-mouth.
- **Status:** API gating + billing infrastructure missing.

### 2.6. Rural producers (large estates, family corporate groups)

- **Pain:** Insumos planning — which products, which suppliers, which alternatives.
- **What they buy:** Inteligência de Insumos + Pulso de Mercado + AgriSafe Oracle for advisory.
- **WTP:** **R$ 200–800/month per estate** — many but small.
- **Sales motion:** Through retailers or directly via App Campo.
- **Status:** Insumos chapter needs the rebuild on roadmap before this persona is real.

---

## 3. Monetization Models — Ranked by Fit

### 3.1. ★ SaaS subscription with confidentiality-tier-gated tiers (recommended primary)

Already half-built. The `public / agrisafe_published / agrisafe_confidential / client_confidential` enum + `resolveCallerTier()` map cleanly to pricing tiers:

| Tier | Includes | Indicative price | Target |
|---|---|---|---|
| **Insights** (free / freemium) | Public Diretório read-only, news feed, last-30d events | R$ 0 | Lead capture |
| **Pro** | + Pulso de Mercado, Marco Regulatório, Recuperação Judicial cross-refs, weekly Executive Briefing, 1 user | **R$ 1.500/mo** | Retailers, small coops, consultants |
| **Business** | + CRM (meetings/leads/key persons), App Campo agenda sync, Oracle (capped queries), 5 users | **R$ 4.500/mo** | Industries (mid-tier), large retailers |
| **Enterprise** | + Financial Institutions Directory, custom alerts, API access, unlimited Oracle, dedicated `entity_features.has_chat`, 20+ users, SLA | **R$ 15k–40k/mo** | Top industries, banks, FIDCs |

**Why this works:** confidentiality enum is wired across CRM endpoints already (mig 040 + `tier_filter()` helper). Building the billing gate is mostly a Stripe webhook + a `subscription_tier` column on a future `accounts` table.

**What's missing to ship Tier-2 in 30 days:** Stripe wiring, multi-user RBAC (already on roadmap as "CRM Access Control"), public landing page, signup flow.

### 3.2. ★ Per-counterparty alerts (FI-targeted)

Every FI we sell to picks a list of counterparties (their borrowers) and pays **R$ 50–200/month per counterparty monitored** for: RJ filings, regulatory CNAE shifts, news mentions, branch-opening alerts (Expansion Detection on roadmap), credit-line changes.

**Why this works:** the data already exists. The product is the alert pipeline + UI for managing the watchlist. Easier sale than full-platform — "monitor your top 200 counterparties for R$ 20k/mo".

### 3.3. ★★ API + data licensing

Per-call REST API to the entity graph + cross-refs. Pricing per 1k calls:
- Read entity profile: **R$ 1 / 1k**
- Cross-ref query (e.g. retailers-in-RJ-by-state): **R$ 5 / 1k**
- Bulk dataset license: **R$ 30k+/year** for full historical dump, monthly refresh

**Buyer:** consultancies, ESG analysts, BNDES-adjacent research desks, AgTech startups.

**Status:** API key infrastructure already shipped (`api_keys` + `api_access_logs`, mig 052). Just needs metering + pricing layer.

### 3.4. ★ White-label embedded analytics

License a Diretório-scoped dashboard to industries to embed inside their B2B portal for distributors. Industry pays R$ 30k–80k/year + setup; their distributors get access for free.

**Why this works:** industries already pay Kynetec for similar reports. Embedded dashboards inside their existing distributor portal is a stickier offering.

**Status:** No multi-tenant theming yet. ~3 months to build.

### 3.5. ★ Sponsored newsletter

Once the email/newsletter outreach is live (roadmap), the newsletter itself becomes a placement product. **R$ 5k–15k per sponsored insert**, capped at 1/month to preserve trust.

**Status:** Schema in place (mig 059), provider integration (Resend) deferred.

### 3.6. ◇ One-off custom reports / consulting

"Mapeamento competitivo do estado de MT — culturas A, B, C" delivered as PDF + dataset. **R$ 25k–75k per project.**

**Why this is a transition product:** keeps cash flowing while SaaS ARR builds. Each report is also an automated-product roadmap input ("if we sold this 5 times, automate it as a self-serve report").

### 3.7. ◇ Lead-generation marketplace

Match retailers ↔ industries with introduction fees. Low priority — high regulatory complexity, low control over outcome.

### 3.8. ✗ Sell aggregated / anonymized data to third parties

**Don't do this** without explicit customer consent. The CRM tier (`agrisafe_confidential`) contains client meeting notes — selling derivatives violates the trust premise. Even anonymized aggregations risk re-identification at this scale (CNPJ density per municipality is high).

---

## 4. Recommended Path (assumption: bootstrapped, no investor pressure)

The temptation is to chase Enterprise (highest ticket). Don't. The cycle is too long for an unfunded team.

### Quarter 1 — Productize the channel directory

- Wire **Stripe + a basic accounts/subscriptions table** (1 week).
- Build a **public landing page** with a free-tier signup (Insights tier — 100 free industry/retailer profile views per month, after which they hit a paywall) (2 weeks).
- Ship **CRM Access Control / multi-user RBAC** (already on roadmap — 3 weeks).
- Launch **Pro tier (R$ 1.5k/mo)** to a warm list of 20 retailers + 10 small industries that Renato + Davi already know.
- **Goal: 10 paying accounts × R$ 1.5k = R$ 15k MRR by end of quarter.** Honest validation, not a launch event.

### Quarter 2 — Land 1-2 anchor industries on Business tier

- Pitch Business tier to **3 mid-tier industries** (not Bayer/Syngenta yet — too slow). Target: Ourofino, Heringer, Vittia, Biocaz tier.
- Use the Diretório de Canais + Per-Culture Canonical Stack (when shipped) as the primary demo.
- **Goal: 1-2 anchor industries × R$ 4.5k = additional R$ 9k MRR.**

### Quarter 3 — Open the API + ship Financial Institutions Directory

- Launch **API tier** for consultancies and AgTechs that have already requested data informally.
- Ship the **Financial Institutions Directory** (high roadmap priority).
- **Open conversations with 2-3 FIDCs / agro banks** — long sales cycle, payoff in Q4-Q1.

### Quarter 4 — Enterprise + first FI close

- One Enterprise deal at R$ 20k+/mo would dwarf everything else.
- White-label deal with one anchor industry as a side bet.
- **Goal: R$ 50k MRR + R$ 200k+ in annual contracts in pipeline.**

---

## 5. What's Blocking Each Tier — Honest Gap Analysis

| Tier | Blockers (tech) | Blockers (business) |
|---|---|---|
| Insights (free) | Public landing page, signup flow, paywall metering | None |
| Pro | Stripe billing, multi-user RBAC, basic alerts | None — can ship in 30 days |
| Business | Per-territory views, App Campo polish, Oracle launch | Needs 1-2 reference customers |
| Enterprise | Custom alerts engine, SLA infra, dedicated account-mgr workflow | Sales cycle requires founder time |
| API | Stripe metered billing, rate limits per-tier, OpenAPI docs | Marketing — need 1 case study |
| White-label | Multi-tenant theming, domain-mapping, isolated tenant data | Probably need to hire a delivery person |

**The single biggest unlock is multi-user RBAC** — already on the roadmap as "CRM Access Control". Without it, every tier above free is a single-user license, which caps the price at "cost of one Renato seat" psychologically.

---

## 6. Risks & What to Validate Before Spending Heavily

1. **Buyers may not pay for what we think they will.**
   - Hypothesis: industries pay R$ 5k+ for the Diretório.
   - Validation: 5 sales calls. If 0/5 convert at R$ 4.5k, drop to R$ 2k Pro for everyone and re-test.

2. **Kynetec / Markestrat / Stratura already serve the industry persona.**
   - Differentiator: real-time + deeper cross-refs (RJ, regulatory, mentions). If buyers don't value real-time over annual reports, the moat is thin.
   - Validation: ask any prospect to compare.

3. **Data quality issues kill credibility on first demo.**
   - The recent Vittia/Biocaz/Syngenta dedup work was necessary. There are likely more.
   - Action: a "data quality" audit pass before any paid demo. The IndustryDedupePanel + Mesclar Todos workflow is the right tool.

4. **Confidentiality — selling client meeting notes to anyone except the client themselves.**
   - The 4-tier enum was built for exactly this. Enforce it: never expose `agrisafe_confidential` data outside the originating account, ever.

5. **Vertex AI cost at scale.**
   - Today: R$1,800 GCP credit until July 2026. Fine for current usage.
   - If Oracle ships and 100 paying users each query 50 times/day → ~150k embedding+generation calls/day → could blow R$ 5k/month in API spend. Cap free-tier queries; premium tier absorbs cost.

6. **Founder-led sales is the bottleneck for ~12 months.**
   - Renato can probably close 10 Pro deals while building. Beyond that, hire a sales lead — but not until R$ 30k MRR.

---

## 7. Bottom Line

**Yes, this is commercializable** — but the right framing is "we are 6 months from a R$ 50k MRR business" not "we have a product to sell tomorrow". Three concrete moves:

1. **Ship the Pro tier in 30 days** (Stripe + RBAC + landing page). 10 accounts × R$ 1.5k = R$ 15k MRR validates the asset.
2. **Don't build Enterprise features yet.** Sell Pro and Business with what already exists; let Enterprise demand pull Enterprise features.
3. **Treat the Financial Institutions Directory as the highest-leverage roadmap item.** It opens the highest-WTP buyer (R$ 8k–80k/mo) AND becomes a moat — once we map every FIDC + FIAGRO + bank exposure, the directory has zero competitor.

Everything else on the roadmap is good engineering. These three moves are how it becomes a business.
