# AgriSafe Admin Panel — Playbook

> **Version**: 1.0.0
> **Date**: 2026-04-02
> **Audience**: Stakeholders, product team, developers, and AI agents

---

## 1. What Is This App

AgriSafe Admin is the **internal back-office** for the AgriSafe platform — a Brazilian agtech/fintech SaaS that provides agricultural companies with credit scoring, data analytics, environmental compliance, and farm monitoring services.

The admin panel is the **single operational cockpit** where AgriSafe's internal team manages every aspect of the platform: client companies, their contracts and credits, user access, external data pipelines, service health, costs, and regulatory compliance.

---

## 2. Who Uses It and Why

### Primary Users
- **Operations Managers** — monitor platform health, crawler pipelines, service uptime, and costs
- **Commercial Team** — manage companies, contracts, credit packages, and renewals
- **Compliance / Risk Analysts** — audit suspicious queries, manage the blacklist, track restructuring risks
- **Support / Admin Staff** — manage users, roles, permissions, API keys, and notification settings
- **Marketing Team** — track agricultural events, commodity market data, and ad campaign performance

### What Motivates Users

| Pain Without Admin Panel | Value the Admin Panel Delivers |
|---|---|
| Scattered data across APIs, databases, and spreadsheets | **One unified interface** with 24 screens covering all operational domains |
| No visibility into expiring contracts or at-risk companies | **Command Center dashboard** with real-time critical alerts (expiring contracts, failing crawlers, judicial restructuring signals) |
| Manual tracking of 312+ companies and 1,398+ users | **Searchable, filterable, paginated tables** with bulk actions and inline status management |
| No way to detect fraudulent or suspicious query patterns | **Auditoria module** with suspect bureau charts, anomaly tables, and full audit trail |
| Blind spots on external data pipeline failures (IBGE, SICAR, ESG) | **Crawler monitoring** with status indicators, failure detection, and batch retry capabilities |
| Cost overruns from unmonitored API consumption | **Cost analytics** with ROI tracking, per-service breakdown, and period comparison |
| No early warning on client financial distress | **Market Data module** cross-referencing CNAE codes with restructuring/judicial recovery news from Reuters, Valor Econômico, etc. |
| Fragmented permission management | **Roles & Permissions matrix** — visual grid mapping roles to 8 permission categories |
| Lost revenue from missed contract renewals | **Contract timeline view** with expiration alerts and renewal workflows |

---

## 3. App Content — Module by Module

### 3.1 VISAO GERAL (Overview)

**Dashboard (Command Center)**
The entry point. Not a vanity metrics board — a **low-latency alert system**. Shows:
- Critical alerts: expiring contracts, failing data crawlers (SICAR/ESG), market risk signals (judicial recovery filings)
- 4 core KPIs: Active Clusters, Total Queries, Monitored Farms, Credit Usage
- Analytical charts: Authorized Queries vs Credit Consumption (6-month trend)
- Companies at Critical Risk table (cross-referencing Bureau analysis + Blacklist)
- Recent activity feed with drill-through navigation

**Atividades (Activity Feed)**
Chronological timeline of all platform actions — contract signings, user creations, credit allocations, support tickets. Filterable by action type, user, and date. Each item expandable to show before/after state.

**Auditoria (Audit)**
Security and compliance hub:
- Suspect bureau query chart (3 time-series datasets)
- Suspicious queries table (paginated, filterable by type and user)
- Full audit trail with detailed action logging

### 3.2 CLIENTES (Clients)

**Empresas (Companies)**
Master list of all 312+ client companies. Each row shows CNPJ, email, credit balance, status (Ativo/Inativo/Garantia), and credit mode (Pre/Post-paid). Filter chips (All, Active, Low Credit, Expiring Contract), search, bulk actions (activate, deactivate, export).

**Empresa Detalhe (Company Detail)**
Full-page deep dive into a single company. 6 tabs:
- Dados: company profile, ERP integration, webhook URL, plan, permissions
- Contrato: contract details, signed status, services enabled
- Usuarios: users belonging to this company
- API Keys: company-specific keys
- Consultas: query history for this company
- Documentos: contract documents (proposals, NDAs, signed contracts, amendments)

**Contratos (Contracts)**
Dual-view: data table + Gantt-like timeline. Shows plan tier, value, signed status, days remaining. Color-coded status badges (Ativo/Expirando/Expirado). Renewal workflow via modal.

**Usuarios (Users)**
Management of 1,398+ platform users. 4 filter dimensions (search, role, status, company). Alert banner for users without manager role. CRUD operations via modals.

**Cargos & Permissoes (Roles & Permissions)**
Visual permission matrix: rows are permission categories (CPF queries, CNPJ queries, Score Rural, INCRA, SICAR/CAR, Biometric Validation, etc.), columns are roles. Click cells to toggle permissions.

### 3.3 OPERACOES (Operations)

**Creditos (Credits)**
Unified credit management (merged from 2 separate legacy pages):
- Analytics dashboard: Consumption vs Addition (line chart), Top Clients (bar chart), Services (donut chart)
- Credit packages: full CRUD with auto-calculated price-per-credit
- Transaction history: searchable, filterable by type/company/service, sortable columns

**API Keys**
Key lifecycle management: create, copy, revoke. Columns include company, type, expiration, status. Filters by status and type. Activity modal per key.

**Consultas Externas (External Queries)**
Global view of all external bureau queries across all companies. Filterable by status, origin bureau, resource type, and date range. Row click opens full query detail including response payload.

### 3.4 DADOS (Data)

**Leads por Area (Leads by Area)**
Geographic mapping of agricultural producers and farms:
- Embedded Google Maps (satellite mode) centered on Mato Grosso
- Two data tabs: Produtores (producers — CNPJ, area, number of farms) and Fazendas (farms — matricula, INCRA code, coordinates, useful area in hectares)
- State (UF) and city filters, export per tab

**Crawlers (External Data Sources)**
Pipeline health monitor for all external data crawlers (IBGE, SICAR, INCRA, Receita Federal, etc.):
- KPI status cards (Success, Running, Failed, Stale) with explanatory modals
- Searchable, sortable table with category filter
- Distinction between source data date and extraction date
- Batch retry for failed crawlers

**Canais (Channels)**
Management of 27,984+ business channels/entities:
- 7-tab detail modal: Overview, Contacts, CNAE Activities & Revenue, AI Insights, Locations, Partners, Documents
- Editable metadata: Risk Score, Rating, Estimated Revenue, notes, phone, emails, executives, WhatsApp
- Map view per channel (coordinates-based)

### 3.5 MONITORAMENTO (Monitoring)

**Monitor de Servicos (Service Monitor)**
Real-time health dashboard for all integrated services/APIs. Each service card shows: status indicator, endpoint, uptime history, response time. "Check Now" trigger per service.

**Custos (Cost Analytics)**
Financial operations intelligence:
- 4 KPIs: Total Cost, Query Volume, Average Cost, ROI
- Period filters (current month, previous, 7d, 30d, 3m, 6m)
- AI-powered insight box
- Per-service cost breakdown table (paginated)
- Service detail modal with cost breakdown and monthly trend chart
- Export capability

**Logs do Sistema (System Logs)**
Unified log viewer (merged from 2 legacy pages):
- Platform logs + Login logs in tabs
- Quick filter chips: All, 4xx Errors, 5xx Errors, Lambda Only
- Search by path or lambda name
- Filter by company
- Log detail modal: full request/response payload, duration, method

### 3.6 MARKETING

**Eventos (Agricultural Events)**
Calendar of agribusiness events, trade shows, and deadlines. Grid layout with highlighted next upcoming event.

**Market Data**
Financial intelligence for the agricultural sector:
- Commodity pricing board: Soja, Milho, Boi Gordo, Cafe Arabica, Acucar VHP — with real-time variation indicators
- Risk Restructuring Monitor: cross-references company CNAE codes with news about judicial recovery, debt restructuring, and payment defaults. Sources: Valor Economico, Reuters, Broadcast Agro, Noticias Agricolas

**Meta Ads**
Facebook/Instagram campaign performance tracking. KPI cards for impressions, clicks, CTR, spend. Clearly marked with "MOCKED DATA" watermark to avoid confusion with live data.

### 3.7 CONFIGURACOES (Settings)

**Blacklist**
Restricted documents/persons management:
- KPI summary cards
- Document table with CPF/CNPJ, category, reason, expiration date
- Special "Obito" (deceased) category with auto-set "Desbloqueado" status
- Add/remove entries via modals with confirmation dialogs

**Notificacoes (Notification Settings)**
Platform notification preferences:
- Toggle switches for notification types
- Webhook configuration
- Email digest settings

---

## 4. Core Business Impact

### 4.1 Revenue Protection
- **Contract renewal alerts** prevent revenue leakage from expired contracts going unnoticed
- **Credit monitoring** ensures companies don't hit zero balance (disrupting their operations and AgriSafe's revenue)
- **Company health scoring** identifies at-risk clients before churn

### 4.2 Operational Efficiency
- **Unified interface** replaces 18+ fragmented screens with 7 logical groups
- **Pagination, search, and filters** across all tables enable handling 300+ companies and 1,400+ users without friction
- **Bulk actions** on companies reduce repetitive manual work
- **Crawler monitoring** catches data pipeline failures before they impact downstream clients

### 4.3 Risk & Compliance
- **Audit trail** provides full traceability of every action on the platform
- **Blacklist management** ensures blocked entities are tracked with proper categories and expiration
- **Market Data restructuring monitor** provides early warning on client financial distress (judicial recovery, debt restructuring)
- **Suspicious query detection** flags potential fraud patterns

### 4.4 Data-Driven Decisions
- **Cost analytics with ROI** helps justify platform spend and identify optimization opportunities
- **Credit consumption trends** inform pricing and packaging decisions
- **Service health monitoring** drives SLA improvements
- **Commodity pricing + market signals** connect internal operations to external market reality

---

## 5. Technical Summary

| Aspect | Detail |
|--------|--------|
| **Architecture** | Single-Page Application (SPA) with hash routing |
| **Stack** | Vite 8 + Vanilla JavaScript (ES modules) + Vanilla CSS |
| **Data** | Static mock data (Phase 2); real API integration planned (Phase 3) |
| **Screens** | 24 pages across 7 navigation groups + login |
| **Design System** | Olive green (#5B7A2F) + orange (#E8722A) on warm cream (#F7F4EF) |
| **Language** | Portuguese (pt-BR) for all UI text |
| **Charts** | Custom SVG (line, bar, donut) — no external chart library |
| **Shared Utilities** | Pagination, modal, toast, confirm dialog |

### Running Locally
```bash
cd dashboard
npm install
npm run dev   # http://localhost:5173
```

---

## 6. Roadmap Context

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 0 — Discovery | Done | UX audit, screenshots, Stitch prototypes |
| Phase 1 — Screens | Locked | All 24 screens with layout and mock data |
| Phase 2 — Interactivity | In Progress | Modals, filters, CRUD, sorting, navigation |
| Phase 3 — Production | Planned | Next.js 15, real API, real CRUD, WebSocket |
| Phase 4 — Intelligence | Planned | Real-time monitoring, alerts, Mapbox |
| Phase 5 — Polish | Planned | Accessibility, performance, dark mode |

---

## 7. Key Differentiators vs Original Admin

| Dimension | Original (Legacy) | Redesign (This Project) |
|---|---|---|
| Navigation | 20 flat menu items, dark sidebar | 7 grouped sections, light sidebar, collapsible |
| Dashboard | 5 KPIs + 2 basic charts | Command Center with critical alerts, risk table, activity feed |
| Company View | Modal popup | Full-page detail with 6 tabs |
| Credits | 2 separate, disconnected pages | Unified: analytics + packages + history |
| Logs | 2 separate pages | Tabbed interface with quick filters |
| Security | Basic blacklist, no audit trail | Blacklist + Auditoria + suspect detection |
| Market Intelligence | Non-existent | Commodity board + restructuring news monitor |
| Data Tables | No pagination, no search | Paginated, searchable, filterable, sortable |
| Permissions | Flat tag list | Visual matrix grid |
