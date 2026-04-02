# AgriSafe Market Knowledge Architecture

**Version:** 1.0  
**Domain:** AgriSafe Market Hub  
**Compliance Level:** LGPD Assured, Tier 1 & Tier 2 Sources Only  

---

## 1. Overview
This document defines the data architecture for the AgriSafe Market Hub. It is organized into a hybrid structure that combines a stable physical hierarchy (folders/domains) with a dynamic metadata model (tags/attributes) to prevent data silos and duplication.

This architecture handles four core dimensions:
1. **Content Type** (e.g., News vs. Data vs. Static Definitions)
2. **Value Chain Positioning** (e.g., Tradings, Rural Producers)
3. **Purpose** (e.g., Commercial, Marketing, Credit Analysis)
4. **Timing/Recurrence** (e.g., Persistent, Recurring, Non-recurring)

---

## 2. Core Hierarchy (Abstractions)
The first level of indexing is the **Content Type**, followed by the **Value Chain Positioning**. This represents how the knowledge is naturally produced and stored.

### 01 Market Data
Recurring, numerical, and structured time-series data.
- `/Tradings_and_Exporters`
- `/Agro_Industries`
- `/Financial_Institutions`
- `/Ag_Input_Retailers`
- `/Rural_Producers`

### 02 Newsrun and Events
Non-recurring, qualitative updates, news items, and market alerts.
- `/Tradings_and_Exporters`
- `/Agro_Industries`
- `/Financial_Institutions`
- `/Ag_Input_Retailers`
- `/Rural_Producers`

### 03 Static Data
Persistent definitions, agronomic truth tables, and regulatory documents.
- `/Definitions_and_Glossary`
- `/Agronomical_Data` (Broadacre Crops, Specialized Crops)
- `/Market_Regulations` (Credit & Finance, Environmental & ESG)

### 04 Curated Insights (AgriSafe Proprietary)
Curated knowledge blending public data with expert opinions. Access to this tier is typically restricted.
- `/Executive_Summaries`
- `/Partner_Analyses`
- `/Proprietary_Valuations`

---

## 3. Dynamic Tagging / Metadata Model
To search and sort effectively, all entries within the Core Hierarchy MUST be tagged with the following attributes upon ingestion:

| Dimension | Mandatory Tags | Behavior / Rule |
| :--- | :--- | :--- |
| **Data Origin** | `Tier 1/2 Public`, `AgriSafe Proprietary`, `Partner` | All Tier 1/2 sources must state source + year + institution (e.g. *CONAB 2026*). |
| **Timing** | `Persistent`, `Recurring`, `Non-recurring` | Drives UI workflows (e.g., Dashboard feeds). |
| **Purpose** | `Marketing`, `Commercial`, `Credit_Analysis` | A single entity (e.g., crop failure news) can be tagged for both Commercial and Credit features simultaneously. |
| **LGPD Clear** | `True`, `False` | Must be `True` before any proprietary analysis is indexed for broad platform consumption. |

---

## 4. Operational Requirements (Rules)
1. **Source Rigor:** Speculative content without transparent methodology is rejected. All statistical claims must cite origin.
2. **Client Data Restrictions:** Proprietary data involving specific AgriSafe clients must be aggregated and anonymized unless explicitly cleared via the CRM (LGPD).
3. **Hybrid Cross-indexing:** The UI should retrieve data structurally (e.g., searching strictly the "Market Data" folder) and simultaneously apply tag filters (e.g., filtering for "Credit Analysis" specifically).

---

## 5. Source Registry (Implementation)

As of April 2026, the platform maintains a registry of **166 public data sources** catalogued from 4 internal crawler lists + active app pipelines. Sources are categorized by:

| Category | Count | Examples |
|----------|-------|---------|
| Fiscal | 38 | Receita Federal (CAFIR, CNPJ), SEFAZ estaduais, CND |
| Agropecuaria | 33 | CONAB, IBGE PAM, CEPEA, INMET, Aenda |
| Socioambiental | 20 | IBAMA embargos, ICMBio UCs, INCRA SIGEF/SNCR, FUNAI |
| Financeiro | 17 | BCB SGS, SICOR, BNDES, MAPA PSR, PGFN |
| Geografias | 8 | IBGE municipios, PRODES, Biomas, ZARC, ANTT |
| Agronomico | 3 | CAR estaduais (MT, MS, TO) |
| Logistica | 3 | CONAB armazens, usinas, ONTL |

**URL Health:** 112 active, 54 inactive (checked 2026-04-02)

**Source Orchestration Workflow:**
When adding a new source: Analyze scraping method → Check conflicts with existing sources → Register in source-registry.json → Build cron ingestion → Run sample check → Validate against personas.

See `CLAUDE.md` for the full data source orchestration workflow.

---

## 6. Data Freshness Tiers

| Frequency | Sources | Pipeline |
|-----------|---------|----------|
| Daily | BCB SGS (8 series), RSS news (4 feeds), Legal RSS (3 feeds), IBAMA embargos | Vercel cron 08:00 UTC |
| Weekly | MTP trabalho escravo, CNPJ Receita Federal | Manual/planned |
| Monthly | SICOR, BACEN agencias, INMET, CAFIR | Manual/planned |
| Annual | IBGE PAM, PRODES, CONAB safra, ZARC, Biomas | Manual/planned |
| On-demand | Oraculo Canais (retailers), State registries | Script import |
