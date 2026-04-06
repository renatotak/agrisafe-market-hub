# AgriSafe Market Hub — Entity Model

> **Canonical reference** for the data model that underpins every feature in this codebase.
> Last revised: 2026-04-06

This document defines the **5 core nodes**, the **role and relationship layer** above them, and the **rules** every contributor (human or LLM) must follow when adding new tables, scrapers, or features.

If you can't justify how a new column or table relates back to one of the 5 nodes — it doesn't belong in this database.

---

## 1. The 5 core nodes

| # | Node | Identifier | What it represents |
|---|---|---|---|
| 1 | **Legal Entity** | `entity_uid` PK + `tax_id` (CPF or CNPJ) + `tax_id_type` | The universal "actor". Any individual or company that participates in Brazilian agribusiness. |
| 2 | **Farm** | `farm_uid` (CAR / INCRA / centroid hash) | A physical land unit with cadastral or geographic identity. |
| 3 | **Asset** | `asset_uid` + `asset_type` | A financial instrument: CPR, loan, commercial note, insurance, barter contract. |
| 4 | **Commercial Activity** | `activity_uid` + `activity_type` | A commercial transaction: ag-input sale, barter, grain trade. |
| 5 | **AgriSafe Service** | `service_uid` + `service_type` | A contract where AgriSafe provides credit intelligence, monitoring, collection, or Market Hub access to a client. |

### Why these five?

These are the **invariants** of agribusiness commerce. Every fact AgriSafe could ever want to know about its market eventually resolves to "who" (Entity), "where" (Farm), "what financial instrument" (Asset), "what commercial transaction" (Activity), and "what AgriSafe is doing about it" (Service).

If a new feature needs a concept that doesn't fit any of these, the right move is usually to discover it's actually one of them in disguise, or to add it as a junction/role on top of them — **not** to invent a sixth node.

---

## 2. Role and relationship layer

The 5 nodes above are connected by junction tables. The junctions are how the model handles:
- **Multi-role entities** (a single CNPJ can be a retailer + producer + AgriSafe client all at once)
- **Multi-stakeholder farms** (a farm with 4 shareholders, mixing CPFs and CNPJs)
- **Multi-party assets** (a CPR with co-borrowers, lenders, guarantors)
- **Group clients** (a family conglomerate buying AgriSafe services as one named client)
- **Polymorphic service targeting** (a monitoring service watching a farm OR a producer OR a group OR an asset)

### 2.1 `entity_roles` — multi-role per entity

```
entity_roles
├── entity_uid     → legal_entities.entity_uid
└── role_type      ENUM
                   { industry, retailer, cooperative, frigorifico, trader,
                     rural_producer, professional, government,
                     agrisafe_client, agrisafe_partner, competitor }
```

A single `entity_uid` can have many rows in this table.

**Example:** `Agropecuária Bom Jesus Ltda` (CNPJ `12345678`) is a corporate rural producer that also acts as an ag-input distributor for its neighbors AND is a paying AgriSafe client. Three rows in `entity_roles`:
```
(entity_uid=42, role_type=rural_producer)
(entity_uid=42, role_type=retailer)
(entity_uid=42, role_type=agrisafe_client)
```

**Role-specific metadata** lives in per-role tables keyed on `entity_uid`:
- `retailer_metadata(entity_uid, faixa_faturamento, classificacao, grupo_acesso, ...)`
- `producer_metadata(entity_uid, areas_planted, main_crops, ...)`
- `client_profile(entity_uid, since_date, segment, account_manager, ...)`

### 2.2 `groups` and `group_members` — named collections

```
groups
├── group_uid     PK
├── group_type    ENUM { client_household, client_corporate_group,
                         cooperative_membership, monitoring_portfolio,
                         lead_segment, newsletter_audience }
├── name          text
├── billing_email text NULL
└── primary_payer_entity_uid → legal_entities (NULL allowed)

group_members
├── group_uid    → groups.group_uid
└── entity_uid   → legal_entities.entity_uid
```

**When to use a group instead of just multiple junction rows:**
Use a `group` when the **collective itself has identity worth naming** — e.g., "Família Silva" (a client household), "Cooperativa COCAMAR" (a coop's membership), "Q1-2026 Monitoring Portfolio" (an internal AgriSafe batch).

**When NOT to use a group:** for farm ownership and asset stakeholding, prefer **multi-row junctions** (`farm_ownership`, `asset_parties`). Each owner/stakeholder retains independent identity and can be queried directly.

### 2.3 `farm_ownership` — multi-shareholder farms

```
farm_ownership
├── farm_uid          → farms.farm_uid
├── entity_uid        → legal_entities.entity_uid
├── ownership_type    ENUM { sole, joint, partnership, heir, lessee, manager }
└── share_pct         numeric(5,2) NULL
```

A farm with 4 shareholders → 4 rows. CPFs and CNPJs can mix freely because all owners are `legal_entities`.

### 2.4 `asset_parties` — multi-stakeholder assets

```
asset_parties
├── asset_uid     → assets.asset_uid
├── entity_uid    → legal_entities.entity_uid
└── party_role    ENUM { borrower, lender, guarantor, beneficiary, custodian, broker }
```

A CPR with 2 co-borrowers + 1 lender + 1 guarantor → 4 rows. Multiple co-borrowers → multiple rows with the same `party_role`.

### 2.5 `agrisafe_service_contracts` and `agrisafe_service_targets`

```
agrisafe_service_contracts
├── service_uid           PK
├── service_type          ENUM { credit_intelligence, monitoring,
                                 collection, market_hub_access, custom }
├── client_group_uid      → groups.group_uid       ← always a group, even of size 1
├── start_date            date
├── end_date              date NULL
├── status                ENUM { active, paused, ended }
└── confidentiality       ENUM { agrisafe_confidential, client_confidential }

agrisafe_service_targets
├── service_uid           → agrisafe_service_contracts.service_uid
├── target_type           ENUM { farm, entity, group, asset }
└── target_id             uuid                       ← polymorphic
```

**Why client is always a group:** so the code path is uniform whether the client is a single individual (group of size 1) or a family conglomerate (group of size N). No special-case logic.

**Why the service target is polymorphic:** a single monitoring contract can watch a specific CPR, the underlying farm, the borrower entity, AND the broader family group — all in one contract. Each target is one row in the junction.

### 2.6 `entity_mentions` — cross-cutting facts

```
entity_mentions
├── entity_uid    → legal_entities.entity_uid
├── source_table  text   ← e.g. 'agro_news', 'regulatory_norms', 'events'
├── source_id     text   ← FK into the source table
├── mention_type  ENUM { subject, organizer, party, beneficiary, mentioned }
└── sentiment     ENUM { positive, neutral, negative } NULL
```

Used for news articles, regulatory norms, events, and any other cross-cutting fact that "mentions" one or more entities. This table is the **graph layer** that lets a query like "show me everything about CNPJ `12345678`" join across all data sources.

---

## 3. Schema overview (Phase 17 target)

### Core tables

```sql
-- 1. Legal Entity
CREATE TABLE legal_entities (
  entity_uid    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_id        text UNIQUE NOT NULL,        -- 11 (CPF) or 14 (CNPJ) digits
  tax_id_type   text NOT NULL CHECK (tax_id_type IN ('cpf','cnpj')),
  cnpj_basico   text GENERATED ALWAYS AS (   -- 8-digit root for CNPJ joins
    CASE WHEN tax_id_type='cnpj' THEN substring(tax_id, 1, 8) ELSE NULL END
  ) STORED,
  legal_name    text,
  display_name  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX idx_le_cnpj_basico ON legal_entities(cnpj_basico) WHERE cnpj_basico IS NOT NULL;

-- 2. Farm
CREATE TABLE farms (
  farm_uid          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  car_code          text UNIQUE NULL,
  incra_code        text UNIQUE NULL,
  centroid_lat      numeric(9,6),
  centroid_lng      numeric(9,6),
  area_ha           numeric(12,2),
  uf                char(2),
  municipio         text,
  created_at        timestamptz DEFAULT now()
);

-- 3. Asset
CREATE TABLE assets (
  asset_uid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type        text NOT NULL CHECK (asset_type IN
                    ('cpr','loan','commercial_note','insurance','barter','other')),
  amount            numeric(18,2),
  currency          text DEFAULT 'BRL',
  start_date        date,
  maturity_date     date,
  farm_uid          uuid REFERENCES farms(farm_uid),
  commodity_id      text,
  status            text DEFAULT 'active',
  confidentiality   text DEFAULT 'public',
  created_at        timestamptz DEFAULT now()
);

-- 4. Commercial Activity
CREATE TABLE commercial_activities (
  activity_uid      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_type     text NOT NULL CHECK (activity_type IN
                    ('ag_input_sale','barter','grain_trade','livestock_sale')),
  retailer_entity_uid uuid REFERENCES legal_entities(entity_uid),
  buyer_entity_uid    uuid REFERENCES legal_entities(entity_uid),
  farm_uid            uuid REFERENCES farms(farm_uid),
  product_id          text,
  quantity            numeric(18,2),
  unit                text,
  value               numeric(18,2),
  currency            text DEFAULT 'BRL',
  date                date,
  confidentiality     text DEFAULT 'public',
  created_at          timestamptz DEFAULT now()
);

-- 5. AgriSafe Service
CREATE TABLE agrisafe_service_contracts (
  service_uid       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type      text NOT NULL CHECK (service_type IN
                    ('credit_intelligence','monitoring','collection',
                     'market_hub_access','custom')),
  client_group_uid  uuid NOT NULL REFERENCES groups(group_uid),
  start_date        date,
  end_date          date,
  status            text DEFAULT 'active',
  confidentiality   text DEFAULT 'agrisafe_confidential',
  created_at        timestamptz DEFAULT now()
);
```

### Junction & support tables

```sql
CREATE TABLE entity_roles (
  entity_uid  uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  role_type   text NOT NULL,
  PRIMARY KEY (entity_uid, role_type)
);

CREATE TABLE groups (
  group_uid                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_type               text NOT NULL,
  name                     text NOT NULL,
  billing_email            text,
  primary_payer_entity_uid uuid REFERENCES legal_entities(entity_uid),
  confidentiality          text DEFAULT 'agrisafe_confidential',
  created_at               timestamptz DEFAULT now()
);

CREATE TABLE group_members (
  group_uid   uuid REFERENCES groups(group_uid) ON DELETE CASCADE,
  entity_uid  uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  PRIMARY KEY (group_uid, entity_uid)
);

CREATE TABLE farm_ownership (
  farm_uid       uuid REFERENCES farms(farm_uid) ON DELETE CASCADE,
  entity_uid     uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  ownership_type text NOT NULL DEFAULT 'sole',
  share_pct      numeric(5,2),
  PRIMARY KEY (farm_uid, entity_uid, ownership_type)
);

CREATE TABLE asset_parties (
  asset_uid   uuid REFERENCES assets(asset_uid) ON DELETE CASCADE,
  entity_uid  uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  party_role  text NOT NULL,
  PRIMARY KEY (asset_uid, entity_uid, party_role)
);

CREATE TABLE agrisafe_service_targets (
  service_uid  uuid REFERENCES agrisafe_service_contracts(service_uid) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('farm','entity','group','asset')),
  target_id    uuid NOT NULL,
  PRIMARY KEY (service_uid, target_type, target_id)
);

CREATE TABLE entity_mentions (
  entity_uid    uuid REFERENCES legal_entities(entity_uid) ON DELETE CASCADE,
  source_table  text NOT NULL,
  source_id     text NOT NULL,
  mention_type  text DEFAULT 'mentioned',
  sentiment     text,
  created_at    timestamptz DEFAULT now(),
  PRIMARY KEY (entity_uid, source_table, source_id)
);
```

---

## 4. How the existing tables migrate

| Existing table | What it becomes | Migration action |
|---|---|---|
| `retailers` | A view over `legal_entities` filtered by `role_type='retailer'`, joined with `retailer_metadata` | Backfill `legal_entities` from `cnpj_raiz`; create `entity_roles` row with `retailer`; move editable fields into `retailer_metadata` |
| `industries` | Same pattern: view filtered by `role_type='industry'` | Backfill from `industries.id` (which is currently a slug — needs to be resolved to a real CNPJ where possible) |
| `competitors` | Same: filtered by `role_type='competitor'` | Resolve `competitors.id` to CNPJs where possible |
| `recuperacao_judicial` | Stays as a fact table; gets a new `entity_uid` FK column | Backfill from `entity_cnpj`. The semantic change: RJ rows are facts ABOUT a legal entity, not entities themselves. |
| `company_enrichment` | Stays as a per-entity cache; key changes from `cnpj_basico` text to `entity_uid` FK | Add `entity_uid` column, backfill via JOIN on `cnpj_basico` |
| `company_notes`, `company_research`, `retailer_intelligence` | Same: re-key on `entity_uid` | Same migration pattern |
| `retailer_locations` | Stays. Re-key on `entity_uid` instead of `cnpj_raiz` | Backfill |
| `agro_news`, `events`, `regulatory_norms` | Stay as fact tables. Get `entity_mentions` rows during ingestion | New scraper logic to scan article body for known CNPJs and write mention rows |
| `commodity_prices`, `commodity_price_history`, `market_indicators` | Unchanged. These are commodity-dimension data, not entity-anchored. | No change |
| `published_articles`, `content_topics`, `knowledge_items`, `news_knowledge` | Unchanged structurally. Knowledge items can use `entity_mentions` to surface entity-relevant search results. | Add mention scanner |

---

## 5. Confidentiality tiers

Every table that may contain proprietary data carries a `confidentiality` enum:

| Tier | Description | Visible to |
|---|---|---|
| `public` | Receita Federal data, public news, public events. | Anyone |
| `agrisafe_published` | AgriSafe-curated insights (e.g. company write-ups). | AgriSafe team and partners |
| `agrisafe_confidential` | Meeting notes, lead pipelines, internal classifications, service contracts. | Authenticated AgriSafe staff with the right role |
| `client_confidential` | Partner-shared data under NDA. | Specific clients only |

The Knowledge Base RAG layer must **filter by tier** based on the requesting user's session. Never leak `agrisafe_confidential` content to a query coming from a `public`-tier session.

---

## 6. Three scenarios — solved

### Scenario 1 — AgriSafe client may be CPF or CNPJ, single or group

```
groups: ('Família Silva', client_household)
group_members: 
  - João Silva       (CPF entity)
  - Maria Silva      (CPF entity)
  - JS Holding Ltda  (CNPJ entity)

agrisafe_service_contracts.client_group_uid → 'Família Silva' group
```

A solo client `João Pereira` is a group of size 1: `groups: ('João Pereira', client_household)` with one member.

### Scenario 2 — One CNPJ is client + retailer + producer

```
legal_entities: entity_uid=42, tax_id='12345678000190', tax_id_type='cnpj'
entity_roles:
  (42, retailer)
  (42, rural_producer)
  (42, agrisafe_client)
```

Each role can have its own metadata table. The Diretório de Canais shows entity 42 as a retailer; the Producer Portfolio (when built) shows it as a producer; the CRM section shows it as a client. **One source of truth for the entity identity.**

### Scenario 3 — Monitoring service watching farm OR producer OR group OR asset

```
agrisafe_service_contracts: service_uid=999, type=monitoring,
                            client_group_uid → 'Família Silva'

agrisafe_service_targets:
  (999, asset, <CPR uid>)        ← monitoring a specific CPR
  (999, farm,  <farm uid>)       ← AND the underlying farm
  (999, entity, <João Silva uid>) ← AND the borrower personally
```

One service contract, three targets of three different types. The polymorphic `target_type` column makes the join explicit.

---

## 7. Rules for contributors

### When adding a new table

1. **Identify which of the 5 nodes it relates to.** If you can't, stop and rethink.
2. **Add an `entity_uid` (or `farm_uid`, `asset_uid`, etc.) FK** to the relevant anchor.
3. **For cross-cutting facts** (news, regulations, events), use the `entity_mentions` junction instead of a direct FK.
4. **Add a `confidentiality` column** if the table may contain proprietary data.
5. **Create the migration** in `src/db/migrations/` and update this document if you're adding a new core concept.

### When adding a new scraper or ingestion job

1. **Use a deterministic algorithm** (Cheerio, regex, Python). Not an LLM.
2. **Resolve identifiers eagerly.** If you scrape a news article that mentions "AgroGalaxy", run it through the entity resolver to find the matching `entity_uid` and write `entity_mentions` rows.
3. **Don't create duplicate identities.** Always check `legal_entities` by `tax_id` before inserting a new entity row.

### When adding a new service or query

1. **Filter by `confidentiality`** based on the session role.
2. **Prefer joins through `legal_entities`** over joins through `cnpj_basico` text columns. The text columns will be migrated away.
3. **For multi-stakeholder queries** (e.g. "all CPRs where João Silva is a co-borrower"), join via `asset_parties`, not by parsing names.

---

## 8. Open questions (deferred)

These are flagged for later resolution but don't block Phase 17:

- **Asset scope** — Should `assets` include physical assets (grain stocks, machinery) or only financial instruments? Current scope: financial only. Physical inventory will get its own concept later.
- **Geographic granularity** — Should `farms` have one row per CAR polygon or one row per "operational unit" (a producer's full landholding)? Current scope: one per CAR; aggregations are derived.
- **Entity resolution across snapshots** — When Receita Federal data changes (a company changes its `razao_social`), how do we maintain `entity_uid` stability? Current answer: `tax_id` is the stable key; `legal_name` updates in place.
- **CPF privacy** — CPFs are PII under LGPD. Storage of CPF entities will be gated behind `agrisafe_confidential` confidentiality and require user-level access control. Public-tier features must never expose raw CPFs.
