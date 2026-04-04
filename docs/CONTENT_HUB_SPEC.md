# Central de Conteúdo — Specification & Requirements

> **Module:** Central de Conteúdo (Content Hub)
> **Component:** `src/components/ContentHub.tsx`
> **Data:** `src/data/published-articles.ts`
> **Last updated:** 2026-04-04

---

## Purpose

Central de Conteúdo is the content management module of AgriSafe Market Hub. It manages the full lifecycle of articles published through AgriSafe's own channels — from ideation (pipeline) through production to publication tracking.

**Scope:** Only content published via AgriSafe channels (LinkedIn, Instagram, Blog) is tracked here. Third-party content (Tarken, partner articles, syndicated pieces) is excluded.

---

## Content Policy

### What IS included:
- Articles written and published under the **AgriSafe** brand
- Content published on AgriSafe's **LinkedIn company page**
- Content published on AgriSafe's **Instagram account**
- Content published on AgriSafe's **blog/website**
- Draft and scheduled articles in the AgriSafe content pipeline

### What is NOT included:
- Tarken articles or any Tarken-branded content
- Partner/guest articles not published via AgriSafe channels
- Syndicated or republished third-party content
- Opinion pieces from external contributors
- News aggregation (that lives in Notícias Agro module)

---

## Data Model

### PublishedArticle

```typescript
interface PublishedArticle {
  id: string;                    // Unique identifier (ag-01, ag-02, etc.)
  title: string;                 // Article title in Portuguese
  campaign: string;              // Campaign name (e.g., "Safra 26/27 Trend")
  channel: "linkedin" | "instagram" | "blog";
  published_at: string;          // ISO date (YYYY-MM-DD)
  status: "published" | "draft" | "scheduled";
  thesis?: string;               // Core thesis/argument of the article
  tags: string[];                // Topic tags for filtering
  hasImage: boolean;             // Has associated visual asset (.png)
  hasDoc: boolean;               // Has associated document (.docx)
  folder: string;                // Campaign folder in marketing campaigns dir
}
```

### Campaign (derived)

```typescript
interface Campaign {
  name: string;                  // Campaign name
  articles: number;              // Total articles in campaign
  startDate: string;             // First article date
  endDate: string;               // Last article date
  published: number;             // Count of published articles
  scheduled: number;             // Count of scheduled articles
  draft: number;                 // Count of draft articles
}
```

---

## Current Content Inventory (AgriSafe only)

### Published Campaigns

| Campaign | Period | Articles | Status |
|----------|--------|----------|--------|
| Xadrez Virtudes | Mar 2, 2026 | 1 | Published |
| Virtudes Agro | Mar 9, 2026 | 1 | Published |
| Dinheiro ou Conhecimento | Mar 16, 2026 | 1 | Published |
| Safra 26/27 Trend | Mar 23-30, 2026 | 2 | Published |
| Novo Ciclo | Apr 6-13, 2026 | 2 | 1 scheduled, 1 draft |
| New Ideas | Apr 20+, 2026 | 1 | Draft |

**Total:** 8 articles (5 published, 1 scheduled, 2 drafts)
**Channel:** All LinkedIn
**Assets location:** `merged projects data/marketing campaigns/`

---

## UI Specification

### Tabs

1. **Publicados** — Shows only `status: "published"` articles, sorted by date descending
2. **Pipeline** — Shows `status: "draft"` and `status: "scheduled"` articles for production management
3. **Calendário** — Week-by-week view of all content grouped by Monday start

### KPI Strip (top)

| Metric | Source |
|--------|--------|
| Total Artigos | `publishedArticles.length` |
| Campanhas | `campaigns.length` |
| Publicados | Count where `status === "published"` |
| Em Produção | Count where `status !== "published"` |

### Filters

- **Search:** By title, tag, thesis, or campaign name
- **Campaign dropdown:** Filter by campaign

### Article Card

Each article shows:
- Channel icon (LinkedIn blue, Instagram pink, Blog green)
- Title + campaign name + publication date
- Asset indicators (doc icon, image icon)
- Status badge (Published green, Scheduled blue, Draft gray)
- Expandable detail: thesis, tags, folder path, asset types

### Campaign Summary (bottom)

Clickable list of campaigns with:
- Name, date range
- Published/scheduled/draft counts
- Click filters the article list

---

## Content Production Workflow

```
1. IDEATION
   New idea → added to "New Ideas" folder → status: "draft"

2. RESEARCH
   Market data gathered from MarketPulse, NA cotações, AgroNews
   Supporting data documented in .md files

3. WRITING
   Article drafted in .docx
   Visual assets created (.png — portrait + landscape)

4. REVIEW
   Thesis validated against market data
   Content reviewed for accuracy

5. SCHEDULING
   status: "scheduled" + published_at date set
   Assets finalized

6. PUBLICATION
   Published on AgriSafe LinkedIn
   status: "published"
   Engagement tracked (future: LinkedIn API integration)
```

---

## Asset Management

All campaign assets are stored in: `merged projects data/marketing campaigns/`

### Folder Structure

```
marketing campaigns/
├── 26-0302 xadrez virtudes/       # Campaign folder (YY-MMDD name)
│   ├── 26-0303 AgriSafe_LinkedIn_Xadrez.png    # Visual asset
│   ├── 26-0303 AgriSafe_LinkedIn_Xadrez_Agro.docx  # Article text
│   └── 26-0302 xadrez de complexidade.pdf       # Supporting material
├── 26-0309 virtudes agro/
├── 26-0316 dinheiro ou conhecimento/
├── 26-0323 safra 2627 trend/      # Multi-article campaign
│   ├── 26-0323_Alerta_Recursos_Livres_FINAL.docx
│   ├── 26-0330_Matriz_Cenarios_Safra_2627.docx
│   ├── Base_Dados_Verificada_Credito_Rural_Mar2026.md  # Research data
│   ├── article1_header_1200x628.png
│   └── article2_header_1200x628.png
├── 26-0401 novo ciclo/
│   ├── 26-0406_Ciclos_SERIE_FINAL.docx
│   ├── 26-0413_Eficiencia_Novo_Crescimento.docx
│   ├── img_art1_landscape.png
│   └── img_art1_portrait.png
└── New ideas/                     # Pipeline / ideation
```

### Naming Convention

- Folders: `YY-MMDD campaign-name`
- Articles: `YY-MMDD_Title_Description.docx`
- Images: `img_artN_orientation.png` or `YY-MMDD_Description.png`
- Research: `description.md`

---

## Future Enhancements

1. **LinkedIn API Integration** — Auto-fetch engagement metrics (views, likes, comments, shares) for published articles
2. **Content Calendar Drag & Drop** — Reschedule articles by dragging in calendar view
3. **AI Draft Generation** — Use OpenAI to generate first drafts from thesis + supporting data + market signals
4. **Asset Preview** — Render image thumbnails and .docx previews inline
5. **Performance Analytics** — Track which thesis angles, tags, and campaigns drive highest engagement
6. **Multi-Channel Adaptation** — Suggest how a LinkedIn article can be adapted for Instagram carousel or newsletter

---

## Dependencies

- `src/data/published-articles.ts` — Article and campaign data
- `src/lib/i18n.ts` — Bilingual labels (PT-BR/EN)
- `lucide-react` — Icons (Linkedin, FileText, Image, Calendar, etc.)
