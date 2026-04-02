# AgriSafe Datalake — Technical Infrastructure & API Specification

> **Documento técnico.** Define como o produto funciona por dentro: endpoints, fontes, pipelines, schemas.
> **Companion doc:** `AGSF_Datalake_PRODUCT.md` (estratégia de produto e unit economics)
>
> Março 2026 | Confidencial — Equipe de Engenharia

---

## 1. Princípio Arquitetural: Input-First Design

**Todo request ao sistema começa com exatamente um de três inputs:**

| Input Type | Formato | Exemplo | Normalização |
|-----------|---------|---------|-------------|
| `cpf` | 11 dígitos (sem pontuação) | `12345678900` | Strip `.` e `-` |
| `cnpj` | 14 dígitos (sem pontuação) | `12345678000199` | Strip `.`, `/` e `-` |
| `farm_id` | Código CAR (UF + IBGE + sequencial) | `MT-5101-A1B2C3D4...` | Uppercase, trim |

O sistema **nunca** pede ao usuário que escolha fontes. O orquestrador decide quais fontes consultar baseado no input type + tier do cliente + cache status.

```
User Input                  Orchestrator                    Data Sources
──────────                  ────────────                    ────────────
CPF: 123.456.789-00   →    normalize("12345678900")   →   1. Cache check (Redis)
                            detect_type("cpf")              2. Datalake interno (PostgreSQL)
                            resolve_tier("PRO")             3. Fontes externas (paralelo):
                            build_query_plan()                 ├── Registro Rural (por CPF)
                            execute_parallel()                 ├── Infosimples (protestos)
                            merge_results()                    ├── BigDataCorp (enrich)
                            calculate_score()                  └── Sentinel Hub (se farm_id encontrado)
                            cache_result(TTL=30d)           4. Score engine
                            return unified_response         5. Cache store
```

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway (FastAPI)                     │
│                    rate limiting + auth + metering                │
├─────────┬──────────┬──────────┬──────────┬──────────────────────┤
│  /score │ /report  │ /monitor │  /ics    │  /fairness           │
├─────────┴──────────┴──────────┴──────────┴──────────────────────┤
│                      Orchestrator Service                        │
│              (query planning + parallel execution)               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  Cache    │  │ Datalake │  │ External │  │  Score Engine  │  │
│  │  (Redis)  │  │ (PgSQL)  │  │  APIs    │  │  (Python)      │  │
│  │  TTL:30d  │  │ +PostGIS │  │  (async) │  │  dual-axis     │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                     ETL / Ingestion Layer (Airflow)              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐  │
│  │ SICOR  │ │ IBAMA  │ │ IBGE   │ │ INMET  │ │ CONAB/MapBio │  │
│  │ daily  │ │ daily  │ │monthly │ │hourly  │ │ monthly      │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └──────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology | Justification |
|-----------|-----------|--------------|
| API Gateway | FastAPI (Python) | Async, auto-docs (OpenAPI), type hints |
| Database | PostgreSQL 16 + PostGIS + TimescaleDB | Geospatial + time series in one DB |
| Cache | Redis 7 | TTL-based cache for pay-per-query results |
| Queue | Celery + Redis | Async external API calls |
| ETL Orchestration | Apache Airflow | Scheduled ingestion pipelines |
| Object Storage | S3/GCS | Raw files (shapefiles, CSVs, GeoTIFFs) |
| Geospatial Processing | GDAL + Rasterio + GeoPandas | NDVI computation, polygon operations |
| Monitoring | Prometheus + Grafana | API latency, external source health, billing |

---

## 3. Database Schema

### 3.1 Core Tables

```sql
-- ============================================================
-- DIMENSIONAL TABLES (refreshed by ETL pipelines)
-- ============================================================

CREATE TABLE dim_municipios (
    id_municipio CHAR(7) PRIMARY KEY,        -- IBGE 7 dígitos
    nome VARCHAR(100) NOT NULL,
    uf CHAR(2) NOT NULL,
    mesorregiao VARCHAR(100),
    microrregiao VARCHAR(100),
    area_km2 NUMERIC(12,2),
    populacao_rural INTEGER,
    geom GEOMETRY(MultiPolygon, 4674),       -- SIRGAS 2000
    centroid_lat NUMERIC(10,7),
    centroid_lon NUMERIC(10,7),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_municipios_geom ON dim_municipios USING GIST(geom);
CREATE INDEX idx_municipios_uf ON dim_municipios(uf);

CREATE TABLE dim_culturas (
    id_cultura SERIAL PRIMARY KEY,
    codigo_ibge VARCHAR(10),
    nome VARCHAR(100) NOT NULL,
    grupo VARCHAR(50),                       -- graos, fibras, oleaginosas, etc
    ciclo VARCHAR(20)                        -- temporaria, permanente
);

-- ============================================================
-- FACT TABLES (from free public sources — ETL populated)
-- ============================================================

CREATE TABLE fato_credito_rural (
    id BIGSERIAL PRIMARY KEY,
    ano_emissao SMALLINT NOT NULL,
    mes_emissao SMALLINT,
    id_municipio CHAR(7) REFERENCES dim_municipios,
    cultura VARCHAR(50),
    modalidade VARCHAR(20),                  -- custeio/investimento/comercializacao
    fonte_recurso VARCHAR(80),
    segmento VARCHAR(20),                    -- pronaf/pronamp/demais
    valor_contratado NUMERIC(15,2),
    area_financiada NUMERIC(12,2),
    qtd_contratos INTEGER,
    data_carga TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_credito_mun_ano ON fato_credito_rural(id_municipio, ano_emissao);
CREATE INDEX idx_credito_cultura ON fato_credito_rural(cultura);

CREATE TABLE fato_producao_municipal (
    id BIGSERIAL PRIMARY KEY,
    ano SMALLINT NOT NULL,
    id_municipio CHAR(7) REFERENCES dim_municipios,
    cultura VARCHAR(100),
    area_plantada_ha NUMERIC(12,2),
    area_colhida_ha NUMERIC(12,2),
    quantidade_produzida_ton NUMERIC(15,2),
    rendimento_kg_ha NUMERIC(10,2),
    valor_producao_mil_reais NUMERIC(15,2),
    data_carga TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_prod_mun_ano ON fato_producao_municipal(id_municipio, ano);

CREATE TABLE fato_embargos (
    id BIGSERIAL PRIMARY KEY,
    cpf_cnpj VARCHAR(14) NOT NULL,
    nome_autuado VARCHAR(200),
    nome_propriedade VARCHAR(200),
    id_municipio CHAR(7) REFERENCES dim_municipios,
    bioma VARCHAR(30),
    area_embargada_ha NUMERIC(12,2),
    tipo_infracao VARCHAR(500),
    status_embargo VARCHAR(30),
    data_embargo DATE,
    geom GEOMETRY(MultiPolygon, 4674),
    ativo BOOLEAN DEFAULT TRUE,
    data_carga TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_embargos_cpf ON fato_embargos(cpf_cnpj);
CREATE INDEX idx_embargos_mun ON fato_embargos(id_municipio);
CREATE INDEX idx_embargos_geom ON fato_embargos USING GIST(geom);

CREATE TABLE fato_sancoes (
    id BIGSERIAL PRIMARY KEY,
    cpf_cnpj VARCHAR(14) NOT NULL,
    nome VARCHAR(200),
    tipo_sancao VARCHAR(20),                 -- CEIS, CNEP, CEPIM
    orgao_sancionador VARCHAR(200),
    data_inicio DATE,
    data_fim DATE,
    descricao TEXT,
    data_carga TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sancoes_cpf ON fato_sancoes(cpf_cnpj);

CREATE TABLE fato_meteorologia (
    id BIGSERIAL PRIMARY KEY,
    estacao_id VARCHAR(10),
    id_municipio CHAR(7) REFERENCES dim_municipios,
    timestamp_medicao TIMESTAMPTZ NOT NULL,
    temperatura_c NUMERIC(5,2),
    umidade_pct NUMERIC(5,2),
    precipitacao_mm NUMERIC(8,2),
    pressao_hpa NUMERIC(7,2),
    vento_ms NUMERIC(5,2),
    radiacao_wm2 NUMERIC(8,2),
    data_carga TIMESTAMP DEFAULT NOW()
);
-- TimescaleDB hypertable for efficient time-series queries
SELECT create_hypertable('fato_meteorologia', 'timestamp_medicao');

-- ============================================================
-- ENTITY-CENTRIC TABLES (populated by queries + enrichment)
-- ============================================================

CREATE TABLE entidade_produtor (
    cpf_cnpj VARCHAR(14) PRIMARY KEY,
    tipo CHAR(2) NOT NULL,                   -- PF ou PJ
    nome VARCHAR(200),
    situacao_cadastral VARCHAR(20),          -- from Receita Federal
    uf_principal CHAR(2),
    id_municipio_principal CHAR(7),
    cnae_principal VARCHAR(10),
    data_abertura DATE,                      -- PJ only
    capital_social NUMERIC(15,2),            -- PJ only
    porte VARCHAR(30),                       -- PJ only
    -- Enrichment fields (populated by Tier PRO queries)
    telefone_validado VARCHAR(20),
    email VARCHAR(100),
    endereco_atualizado TEXT,
    renda_estimada NUMERIC(15,2),
    -- Score fields
    score_credito NUMERIC(6,2),
    score_lavoura NUMERIC(6,2),
    quadrante CHAR(2),
    score_calculado_em TIMESTAMP,
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE entidade_imovel_rural (
    farm_id VARCHAR(100) PRIMARY KEY,        -- Código CAR
    cpf_cnpj_titular VARCHAR(14),
    nome_imovel VARCHAR(200),
    id_municipio CHAR(7) REFERENCES dim_municipios,
    area_total_ha NUMERIC(12,2),
    area_app_ha NUMERIC(12,2),
    area_reserva_legal_ha NUMERIC(12,2),
    area_uso_consolidado_ha NUMERIC(12,2),
    matricula VARCHAR(50),
    cartorio VARCHAR(200),
    codigo_sncr VARCHAR(20),
    codigo_sigef VARCHAR(50),
    geom GEOMETRY(MultiPolygon, 4674),
    -- NDVI monitoring
    ndvi_ultima_medicao NUMERIC(4,3),
    ndvi_data_medicao DATE,
    ndvi_media_historica NUMERIC(4,3),
    ndvi_status VARCHAR(20),                 -- normal, alerta, critico
    -- Source tracking
    fonte VARCHAR(30),                       -- registrorural, sicar, sigef
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_imovel_cpf ON entidade_imovel_rural(cpf_cnpj_titular);
CREATE INDEX idx_imovel_geom ON entidade_imovel_rural USING GIST(geom);

CREATE TABLE fato_score_agsf (
    id BIGSERIAL PRIMARY KEY,
    cpf_cnpj VARCHAR(14) NOT NULL,
    score_credito NUMERIC(6,2),              -- Y axis (0-1000)
    score_lavoura NUMERIC(6,2),              -- X axis (0-2)
    quadrante CHAR(2),                       -- Q1, Q2, Q3, Q4
    tier_consultado VARCHAR(10),             -- FREE, PRO, PREMIUM
    fontes_utilizadas JSONB,
    detalhes JSONB,                          -- breakdown de cada componente
    data_calculo TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_score_cpf ON fato_score_agsf(cpf_cnpj);

-- ============================================================
-- BILLING / METERING
-- ============================================================

CREATE TABLE billing_queries (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    cpf_cnpj_consultado VARCHAR(14),
    input_type VARCHAR(10),                  -- cpf, cnpj, farm_id
    tier VARCHAR(10),
    sources_called JSONB,                    -- {"registrorural": 0.50, "infosimples": 1.20}
    total_cost NUMERIC(8,4),
    cached BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_billing_tenant ON billing_queries(tenant_id, timestamp);
```

---

## 4. API Endpoints Specification

### Base URL: `https://api.agrisafe.agr.br/v1`
### Auth: Bearer token (JWT) with tenant_id + tier claim

### 4.1 `POST /score` — Score AGSF (All Tiers)

**The primary endpoint. Every product journey starts here.**

**Request:**
```json
{
  "input": "12345678900",
  "input_type": "cpf"
}
```

Input type is auto-detected if omitted:
- 11 digits → `cpf`
- 14 digits → `cnpj`
- Contains `-` with letters → `farm_id`

**Response (Tier FREE):**
```json
{
  "status": "ok",
  "input": "12345678900",
  "input_type": "cpf",
  "tier": "FREE",
  "score": {
    "credito": 620,
    "lavoura": 1.3,
    "quadrante": "Q1",
    "classificacao": "Alta confiabilidade + boa lavoura",
    "recomendacao": "Aprovação com condições otimizadas"
  },
  "resumo": {
    "embargos_ibama": 0,
    "sancoes_gov": 0,
    "municipio_principal": "Sorriso/MT",
    "cultura_predominante": "Soja",
    "credito_rural_total_5a": 2450000.00,
    "area_financiada_total_ha": 850.0,
    "precipitacao_30d_mm": 185.4,
    "precipitacao_normal_mm": 200.0,
    "precipitacao_status": "normal"
  },
  "fontes_consultadas": [
    "sicor", "ibama_embargos", "transparencia_ceis",
    "transparencia_cnep", "inmet", "ibge_pam"
  ],
  "cached": false,
  "timestamp": "2026-03-29T14:30:00Z",
  "upgrade_hint": {
    "tier": "PRO",
    "desbloquearia": [
      "Protestos ativos (3 encontrados)",
      "Imóveis rurais vinculados (2 propriedades)",
      "NDVI atual da lavoura",
      "Telefone e endereço atualizados",
      "Relatório PDF completo"
    ]
  }
}
```

**Response (Tier PRO):**
```json
{
  "status": "ok",
  "input": "12345678900",
  "input_type": "cpf",
  "tier": "PRO",
  "score": {
    "credito": 380,
    "lavoura": 1.4,
    "quadrante": "Q2",
    "classificacao": "Baixa confiabilidade, porém boa lavoura",
    "recomendacao": "Aprovação com garantias adicionais. CPR registrada obrigatória."
  },
  "detalhes_credito": {
    "componentes": {
      "historico_pagamento": {"valor": 45, "peso": 0.30, "fonte": "protestos"},
      "endividamento_rural": {"valor": 60, "peso": 0.25, "fonte": "sicor"},
      "situacao_cadastral": {"valor": 85, "peso": 0.15, "fonte": "receita_federal"},
      "processos_judiciais": {"valor": 30, "peso": 0.15, "fonte": "datajud"},
      "sancoes_embargos": {"valor": 90, "peso": 0.15, "fonte": "ibama+transparencia"}
    }
  },
  "detalhes_lavoura": {
    "componentes": {
      "ndvi_atual": {"valor": 0.72, "referencia": 0.68, "status": "acima_media", "peso": 0.35},
      "produtividade_historica": {"valor": 58.2, "unidade": "sc/ha", "media_regional": 54.0, "peso": 0.25},
      "cobertura_seguro": {"valor": true, "tipo": "custeio", "peso": 0.20},
      "risco_climatico_zarc": {"valor": "baixo", "janela_plantio": "ok", "peso": 0.20}
    }
  },
  "protestos": {
    "total": 3,
    "valor_total": 85000.00,
    "detalhes": [
      {"credor": "COOPERATIVA X", "valor": 45000.00, "data": "2025-11-15", "cartorio": "1º Protesto - Sorriso/MT"},
      {"credor": "REVENDA Y", "valor": 25000.00, "data": "2025-12-01", "cartorio": "1º Protesto - Sorriso/MT"},
      {"credor": "BANCO Z", "valor": 15000.00, "data": "2026-01-20", "cartorio": "2º Protesto - Sorriso/MT"}
    ],
    "fonte": "infosimples_cenprot"
  },
  "imoveis_rurais": [
    {
      "farm_id": "MT-5101802-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6",
      "nome": "Fazenda Santa Clara",
      "municipio": "Sorriso/MT",
      "area_total_ha": 520.0,
      "area_app_ha": 52.0,
      "area_reserva_legal_ha": 104.0,
      "matricula": "12345",
      "cartorio": "CRI Sorriso",
      "ndvi_atual": 0.72,
      "ndvi_media_historica": 0.68,
      "ndvi_status": "normal",
      "ndvi_data": "2026-03-25",
      "embargo_ibama": false,
      "fonte": "registrorural"
    },
    {
      "farm_id": "MT-5101802-Z9Y8X7W6V5U4T3S2R1Q0P9O8N7M6L5K4",
      "nome": "Fazenda Boa Vista",
      "municipio": "Sorriso/MT",
      "area_total_ha": 330.0,
      "embargo_ibama": false,
      "fonte": "registrorural"
    }
  ],
  "enriquecimento": {
    "telefone": "(66) 99999-1234",
    "telefone_validado": true,
    "endereco": "Rod MT-242 Km 35, Sorriso/MT, 78890-000",
    "renda_estimada": 450000.00,
    "fonte": "bigdatacorp"
  },
  "resumo_regional": {
    "municipio": "Sorriso/MT",
    "id_municipio": "5107875",
    "inadimplencia_regional_pct": 8.5,
    "credito_rural_total_municipio": 1250000000.00,
    "area_soja_ha": 630000,
    "produtividade_media_sc_ha": 54.0,
    "precipitacao_acumulada_safra_mm": 920,
    "precipitacao_normal_safra_mm": 1050,
    "status_climatico": "deficit_moderado"
  },
  "fontes_consultadas": [
    "sicor", "ibama_embargos", "transparencia_ceis", "transparencia_cnep",
    "inmet", "ibge_pam", "registrorural", "infosimples_protestos",
    "bigdatacorp", "sentinel_hub", "datajud", "conab"
  ],
  "custo_consulta": {
    "registrorural": 0.80,
    "infosimples_protestos": 1.20,
    "bigdatacorp": 0.30,
    "sentinel_hub": 0.05,
    "total": 2.35
  },
  "cached": false,
  "cache_expires": "2026-04-28T14:30:00Z",
  "timestamp": "2026-03-29T14:30:00Z"
}
```

**Response (Tier PREMIUM) — adds:**
```json
{
  "...": "...all PRO fields...",
  "tier": "PREMIUM",
  "exposicao_cpr": {
    "total_cprs_emitidas": 4,
    "valor_total_cprs": 1800000.00,
    "safra_comprometida_pct": 72.0,
    "detalhes": [
      {"credor": "Revenda Alpha", "valor": 600000, "vencimento": "2026-06-30", "produto": "Soja", "status": "vigente"},
      {"credor": "FIDC Beta", "valor": 500000, "vencimento": "2026-07-15", "produto": "Soja", "status": "vigente"},
      {"credor": "Cooperativa Gamma", "valor": 400000, "vencimento": "2026-05-30", "produto": "Milho", "status": "vigente"},
      {"credor": "Banco Delta", "valor": 300000, "vencimento": "2026-08-30", "produto": "Soja", "status": "vigente"}
    ],
    "alerta": "Safra comprometida em 72%. Risco de sobreposição de garantias.",
    "fonte": "cerc"
  },
  "score_serasa": {
    "agro_score": 520,
    "farm_check_status": "aprovado_com_ressalvas",
    "mcr_compliance": true,
    "fonte": "serasa_experian"
  },
  "ics_regional": {
    "municipio": "Sorriso/MT",
    "cultura": "Soja",
    "ics_valor": 0.85,
    "ics_classificacao": "alto_comprometimento",
    "descricao": "85% da capacidade produtiva de soja do município já comprometida em CPRs registradas",
    "fonte": "cerc+ibge+conab"
  },
  "indisponibilidade_bens": {
    "existe": false,
    "fonte": "onr_cnib"
  },
  "compliance_ambiental": {
    "car_valido": true,
    "reserva_legal_ok": true,
    "app_ok": true,
    "desmatamento_prodes_5a": false,
    "deter_alertas_12m": 0,
    "eudr_compliant": true,
    "soy_moratorium_ok": true,
    "fonte": "ibama+inpe+mapbiomas+agrotools"
  }
}
```

### 4.2 `POST /score` — Input por Farm ID

**Request:**
```json
{
  "input": "MT-5101802-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6",
  "input_type": "farm_id"
}
```

**Orchestrator behavior for farm_id input:**
1. Query `entidade_imovel_rural` for cached property data
2. If found: extract `cpf_cnpj_titular` → cascade to full CPF/CNPJ analysis
3. If not found: query Registro Rural API by farm_id → extract titular → cascade
4. Always fetch fresh NDVI via Sentinel Hub for the property polygon

**Response:** Same structure as CPF response, but `imoveis_rurais` array has the queried farm first with full NDVI detail.

### 4.3 `GET /report/{cpf_cnpj}` — Relatório PDF (PRO+)

**Request:**
```
GET /report/12345678900
Accept: application/pdf
```

**Response:** Binary PDF with:
- Score AGSF visual (quadrant chart)
- Due diligence checklist (all sources, green/yellow/red)
- Property map with NDVI overlay
- Protest details
- Regional context (ICS, credit concentration)
- Timestamp and sources audit trail

### 4.4 `POST /monitor/portfolio` — Monitoramento de Carteira (PRO+)

**Request:**
```json
{
  "portfolio_id": "carteira_2026_safra",
  "cpf_cnpjs": ["12345678900", "98765432100", "11223344556"],
  "alerts_enabled": ["embargo", "protesto", "ndvi_anomaly", "rj"],
  "ndvi_frequency": "weekly"
}
```

**Response:**
```json
{
  "portfolio_id": "carteira_2026_safra",
  "total_produtores": 3,
  "monitoramento_ativo": true,
  "proxima_verificacao": "2026-04-05T06:00:00Z",
  "alertas_configurados": ["embargo", "protesto", "ndvi_anomaly", "rj"],
  "resumo_atual": {
    "Q1": {"count": 1, "valor_nominal": 700000},
    "Q2": {"count": 1, "valor_nominal": 500000},
    "Q3": {"count": 0, "valor_nominal": 0},
    "Q4": {"count": 1, "valor_nominal": 300000}
  }
}
```

### 4.5 `GET /ics/{id_municipio}/{cultura}` — ICS Regional (PREMIUM)

**Request:**
```
GET /ics/5107875/soja
```

**Response:**
```json
{
  "id_municipio": "5107875",
  "municipio": "Sorriso",
  "uf": "MT",
  "cultura": "soja",
  "safra": "2025/26",
  "ics": {
    "valor": 0.85,
    "classificacao": "alto_comprometimento",
    "numerador": {
      "volume_cprs_registradas_ton": 1890000,
      "valor_cprs_registradas_brl": 2835000000,
      "fonte": "cerc"
    },
    "denominador": {
      "producao_esperada_ton": 2220000,
      "area_plantada_ha": 630000,
      "produtividade_esperada_sc_ha": 54.0,
      "fonte": "ibge_pam+conab"
    },
    "ajuste_ndvi": {
      "ndvi_atual_medio": 0.65,
      "ndvi_historico_medio": 0.70,
      "fator_ajuste": 0.93,
      "fonte": "sentinel_hub+mapbiomas"
    }
  },
  "heatmap_vizinhos": [
    {"municipio": "Lucas do Rio Verde", "id": "5105259", "ics": 0.72},
    {"municipio": "Nova Mutum", "id": "5106224", "ics": 0.68},
    {"municipio": "Sinop", "id": "5107909", "ics": 0.55}
  ],
  "alerta": "Região com alto comprometimento de safra. Risco de default sistêmico elevado.",
  "timestamp": "2026-03-29T14:30:00Z"
}
```

### 4.6 `POST /fairness/{portfolio_id}` — Fairness Opinion (PREMIUM)

**Request:**
```json
{
  "portfolio_id": "fiagro_alpha_2026",
  "top_exposures": 20,
  "output": "pdf"
}
```

**Response:** PDF laudo técnico containing per-CPR:
- Property identification (CAR polygon overlay on satellite)
- NDVI time-series chart (last 12 months vs historical average)
- Embargo/deforestation check (IBAMA + PRODES + DETER)
- ICS of the producer's municipality
- CPR exposure total (CERC)
- Score AGSF dual-axis positioning
- Compliance status (EUDR, Soy Moratorium, BCB 4.327)
- Overall guarantee health score (0–100)

---

## 5. Source Orchestration Matrix

### Which sources are called per input type × tier:

| Source | Type | Cost/query | FREE CPF | FREE CNPJ | FREE Farm | PRO CPF | PRO CNPJ | PRO Farm | PREMIUM * |
|--------|------|-----------|----------|-----------|-----------|---------|----------|----------|-----------|
| **Datalake SICOR** | Internal | R$0 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Datalake IBAMA** | Internal | R$0 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Datalake Sanções** | Internal | R$0 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Datalake CNPJ** | Internal | R$0 | — | ✅ | — | — | ✅ | — | ✅ |
| **Datalake INMET** | Internal | R$0 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Datalake IBGE PAM** | Internal | R$0 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Datalake DataJud** | Internal | R$0 | — | — | — | ✅ | ✅ | ✅ | ✅ |
| **Datalake MapBiomas** | Internal | R$0 | — | — | ✅ | — | — | ✅ | ✅ |
| Registro Rural | External | R$0.30–1.50 | — | — | — | ✅ | ✅ | ✅ | ✅ |
| Infosimples Protestos | External | R$0.50–1.50 | — | — | — | ✅ | ✅ | — | ✅ |
| Infosimples CNPJ | External | R$0.15–0.60 | — | — | — | — | ✅ | — | ✅ |
| BigDataCorp | External | R$0.05–0.50 | — | — | — | ✅ | ✅ | — | ✅ |
| Sentinel Hub NDVI | External | R$0.02–0.10 | — | — | — | — | — | ✅ | ✅ |
| CERC CPR Exposure | External | Contract | — | — | — | — | — | — | ✅ |
| Serasa Farm Check | External | Contract | — | — | — | — | — | — | ✅ |
| ONR/CNIB | External | Contract | — | — | — | — | — | — | ✅ |
| Agrotools SAFE | External | Contract | — | — | — | — | — | — | ✅ |

### Query Plan Logic (Pseudocode)

```python
async def build_query_plan(input: str, input_type: str, tier: str) -> QueryPlan:
    plan = QueryPlan()
    
    # --- ALWAYS (all tiers) ---
    plan.add_internal("datalake_embargos", query_by=input_type)
    plan.add_internal("datalake_sancoes", query_by=input_type)
    plan.add_internal("datalake_inmet", query_by="municipio")  # needs municipio resolution
    plan.add_internal("datalake_sicor", query_by="municipio")
    plan.add_internal("datalake_ibge_pam", query_by="municipio")
    
    if input_type == "cnpj":
        plan.add_internal("datalake_cnpj", query_by="cnpj")
    
    if input_type == "farm_id":
        plan.add_internal("datalake_mapbiomas", query_by="geometry")
    
    # --- PRO tier additions ---
    if tier in ("PRO", "PREMIUM"):
        cache_key = f"pro:{input}"
        cached = await redis.get(cache_key)
        if not cached:
            plan.add_external("registrorural", query_by=input_type, cost=0.80)
            plan.add_external("infosimples_protestos", query_by=input_type, cost=1.20)
            plan.add_external("bigdatacorp", query_by=input_type, cost=0.30)
            plan.add_internal("datalake_datajud", query_by=input_type)
            
            if input_type in ("cpf", "cnpj"):
                plan.add_external("infosimples_cnpj", query_by="cnpj", cost=0.40)
            
            # After Registro Rural returns farm_ids, fetch NDVI
            plan.add_deferred("sentinel_hub_ndvi", 
                              depends_on="registrorural.farm_ids",
                              cost=0.05)
    
    # --- PREMIUM tier additions ---
    if tier == "PREMIUM":
        plan.add_external("cerc_cpr_exposure", query_by=input_type, cost="contract")
        plan.add_external("serasa_farm_check", query_by=input_type, cost="contract")
        plan.add_external("onr_cnib", query_by=input_type, cost="contract")
        plan.add_external("agrotools_safe", query_by="farm_id", cost="contract")
    
    return plan
```

---

## 6. ETL Pipeline Specifications

### 6.1 Daily Pipelines

| Pipeline | Source | Schedule | Method | Volume | Storage |
|----------|--------|----------|--------|--------|---------|
| `etl_ibama_embargos` | dadosabertos.ibama.gov.br | 06:00 UTC | CKAN API → CSV → PostgreSQL | ~50k records total | fato_embargos |
| `etl_transparencia_sancoes` | portaldatransparencia.gov.br | 07:00 UTC | REST API → JSON → PostgreSQL | ~15k records | fato_sancoes |
| `etl_inmet_meteorologia` | apitempo.inmet.gov.br | Every 2h | REST API → JSON → TimescaleDB | ~570 stations × 12/day | fato_meteorologia |
| `etl_deter_alertas` | terrabrasilis.dpi.inpe.br | 08:00 UTC | WFS → GeoJSON → PostGIS | ~100-500 alerts/day | fato_deter_alertas |

### 6.2 Monthly Pipelines

| Pipeline | Source | Schedule | Method | Volume | Storage |
|----------|--------|----------|--------|--------|---------|
| `etl_sicor_credito` | olinda.bcb.gov.br | Day 20 | OData API → JSON → PostgreSQL | ~5M records/year | fato_credito_rural |
| `etl_receita_cnpj` | arquivos.receitafederal.gov.br | Day 5 | Bulk CSV download (85GB) → PostgreSQL | ~55M CNPJs | entidade_cnpj |
| `etl_ibge_pam` | apisidra.ibge.gov.br | September | REST API → JSON → PostgreSQL | ~350k rows/year | fato_producao_municipal |
| `etl_ibge_lspa` | apisidra.ibge.gov.br | Day 15 | REST API → JSON → PostgreSQL | ~2k rows/month | fato_estimativa_safra |
| `etl_conab_safra` | portaldeinformacoes.conab.gov.br | Day 15 | Scrape + download TXT/XLS → PostgreSQL | ~500 rows/month | fato_conab_safra |
| `etl_conab_precos` | portaldeinformacoes.conab.gov.br | Weekly | Scrape + download TXT → PostgreSQL | ~20k series | fato_precos_agro |
| `etl_cvm_fiagro` | dados.cvm.gov.br | Day 10 | Bulk CSV download → PostgreSQL | ~145 funds | fato_fiagro |

### 6.3 Annual/Seasonal Pipelines

| Pipeline | Source | Schedule | Method | Storage |
|----------|--------|----------|--------|---------|
| `etl_mapbiomas` | data.mapbiomas.org | January | GeoTIFF download → PostGIS raster | raster_mapbiomas |
| `etl_car_sicar` | car.gov.br | Quarterly | Shapefile download per municipality → PostGIS | entidade_imovel_rural |
| `etl_mapa_zarc` | dados.agricultura.gov.br | Pre-planting | CSV download → PostgreSQL | dim_zarc |
| `etl_susep_seguro` | susep.gov.br | Monthly | CSV download → PostgreSQL | fato_seguro_rural |
| `etl_tse_pep` | dadosabertos.tse.jus.br | Election cycle | Bulk CSV → PostgreSQL | dim_pep |

### 6.4 Sample ETL: SICOR Pipeline

```python
# airflow/dags/etl_sicor.py
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta
import requests
import pandas as pd
from sqlalchemy import create_engine

SICOR_BASE = "https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata"

def extract_sicor_municipios(**context):
    """Extract credit data from SICOR OData API"""
    year = context["execution_date"].year
    all_data = []
    skip = 0
    batch_size = 1000
    
    while True:
        r = requests.get(
            f"{SICOR_BASE}/RecursosMunicipios",
            params={
                "$filter": f"AnoEmissao eq '{year}'",
                "$top": batch_size,
                "$skip": skip,
                "$format": "json",
                "$orderby": "MesEmissao"
            },
            timeout=60
        )
        r.raise_for_status()
        batch = r.json().get("value", [])
        if not batch:
            break
        all_data.extend(batch)
        skip += batch_size
    
    df = pd.DataFrame(all_data)
    df.to_parquet(f"/tmp/sicor_{year}.parquet", index=False)
    return f"/tmp/sicor_{year}.parquet"

def transform_sicor(file_path, **context):
    """Normalize and clean SICOR data"""
    df = pd.read_parquet(file_path)
    df = df.rename(columns={
        "AnoEmissao": "ano_emissao",
        "MesEmissao": "mes_emissao", 
        "cdMunicipio": "id_municipio",
        "Produto": "cultura",
        "Modalidade": "modalidade",
        "FonteRecurso": "fonte_recurso",
        "VlRecurso": "valor_contratado",
        "AreaFinanciada": "area_financiada",
        "Segmento": "segmento"
    })
    # Pad municipal code to 7 digits
    df["id_municipio"] = df["id_municipio"].astype(str).str.zfill(7)
    return df

def load_sicor(df, **context):
    """Load into PostgreSQL"""
    engine = create_engine("postgresql://agsf:***@db:5432/datalake")
    df.to_sql("fato_credito_rural", engine, if_exists="append", index=False)

with DAG("etl_sicor", schedule_interval="0 6 20 * *", start_date=datetime(2026, 1, 1)):
    extract = PythonOperator(task_id="extract", python_callable=extract_sicor_municipios)
    transform = PythonOperator(task_id="transform", python_callable=transform_sicor)
    load = PythonOperator(task_id="load", python_callable=load_sicor)
    extract >> transform >> load
```

---

## 7. External API Integration Specs

### 7.1 Registro Rural

```python
# integrations/registrorural.py
import httpx

class RegistroRuralClient:
    BASE_URL = "https://api.registrorural.com.br/api/v1"
    
    def __init__(self, api_token: str):
        self.headers = {"Authorization": f"Bearer {api_token}"}
    
    async def busca_por_cpf(self, cpf: str) -> dict:
        """Returns all rural properties linked to a CPF"""
        async with httpx.AsyncClient() as client:
            # Search CAR by CPF
            r = await client.get(
                f"{self.BASE_URL}/car/busca/cpf-cnpj/{cpf}",
                headers=self.headers, timeout=30
            )
            car_results = r.json()
            
            # Search SNCR (INCRA) by CPF
            r2 = await client.get(
                f"{self.BASE_URL}/sncr/busca/cpf-cnpj/{cpf}",
                headers=self.headers, timeout=30
            )
            sncr_results = r2.json()
            
            return {"car": car_results, "sncr": sncr_results}
    
    async def consulta_car(self, farm_id: str) -> dict:
        """Full CAR data for a specific property"""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.BASE_URL}/car/consulta/{farm_id}",
                headers=self.headers, timeout=30
            )
            return r.json()
    
    async def busca_por_coordenada(self, lat: float, lon: float, raio_km: float = 5) -> dict:
        """Find properties near a coordinate"""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.BASE_URL}/busca/coordenada",
                params={"lat": lat, "lon": lon, "raio": raio_km},
                headers=self.headers, timeout=30
            )
            return r.json()
```

### 7.2 Infosimples

```python
# integrations/infosimples.py
class InfosimplesClient:
    BASE_URL = "https://api.infosimples.com/api/v2/consultas"
    
    def __init__(self, api_token: str):
        self.token = api_token
    
    async def consulta_protestos(self, cpf_cnpj: str) -> dict:
        """National protest check via IEPTB/CENPROT"""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.BASE_URL}/ieptb/protestos",
                json={"token": self.token, "cpf_cnpj": cpf_cnpj, "timeout": 300},
                timeout=60
            )
            return r.json()
    
    async def consulta_cnpj(self, cnpj: str) -> dict:
        """Full CNPJ details from Receita Federal"""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.BASE_URL}/receita-federal/cnpj",
                json={"token": self.token, "cnpj": cnpj, "timeout": 300},
                timeout=60
            )
            return r.json()
    
    async def consulta_cnd_federal(self, cpf_cnpj: str) -> dict:
        """Federal tax clearance certificate (PGFN)"""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.BASE_URL}/receita-federal/pgfn",
                json={"token": self.token, "cpf_cnpj": cpf_cnpj},
                timeout=60
            )
            return r.json()
```

### 7.3 Sentinel Hub (NDVI)

```python
# integrations/sentinel_hub.py
class SentinelHubClient:
    STATS_URL = "https://services.sentinel-hub.com/api/v1/statistics"
    
    NDVI_EVALSCRIPT = """
    //VERSION=3
    function setup() { return { input: ["B04", "B08"], output: [{ id: "ndvi", bands: 1 }] }; }
    function evaluatePixel(sample) {
        let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
        return { ndvi: [ndvi] };
    }
    """
    
    async def get_ndvi_stats(self, geojson_polygon: dict, 
                             date_from: str, date_to: str) -> dict:
        """Get NDVI statistics for a farm polygon"""
        payload = {
            "input": {
                "bounds": {"geometry": geojson_polygon},
                "data": [{
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {"from": date_from, "to": date_to},
                        "maxCloudCoverage": 30
                    }
                }]
            },
            "aggregation": {
                "timeRange": {"from": date_from, "to": date_to},
                "aggregationInterval": {"of": "P5D"}
            },
            "calculations": {
                "ndvi": {
                    "histograms": {"default": {"nBins": 10}},
                    "statistics": {"default": {"percentiles": {"k": [25, 50, 75]}}}
                }
            }
        }
        async with httpx.AsyncClient() as client:
            r = await client.post(
                self.STATS_URL, json=payload,
                headers={"Authorization": f"Bearer {self.access_token}"},
                timeout=120
            )
            return r.json()
```

---

## 8. Caching Strategy

### Rules

| Data type | Cache TTL | Rationale |
|-----------|----------|-----------|
| Datalake internals (embargos, SICOR, etc.) | No cache (query PostgreSQL directly) | Already local, fast |
| Registro Rural (property data) | 30 days | Property data changes slowly |
| Infosimples protestos | 7 days | Protests can appear quickly |
| BigDataCorp enrichment | 30 days | Phone/address stable |
| Sentinel Hub NDVI | 5 days | Matches satellite revisit |
| CERC CPR exposure | 1 day | CPRs can be emitted any day |
| Serasa score | 7 days | Score recalculated weekly |

### Cache Key Format

```
cache:{tier}:{input_type}:{normalized_input}:{source}
# Example: cache:PRO:cpf:12345678900:registrorural
```

### Billing Impact

```python
async def execute_query(source: str, input: str, tier: str):
    cache_key = f"cache:{tier}:{input}:{source}"
    cached = await redis.get(cache_key)
    
    if cached:
        # NO BILLING — return cached result
        return json.loads(cached), {"cached": True, "cost": 0}
    
    # BILLING — call external API
    result = await source_client.query(input)
    await redis.setex(cache_key, TTL_MAP[source], json.dumps(result))
    
    # Log for billing
    await log_billing(tenant_id, source, cost=COST_MAP[source])
    
    return result, {"cached": False, "cost": COST_MAP[source]}
```

---

## 9. Score Engine Calculation

### Score Crédito (Y axis, 0–1000)

```python
def calculate_score_credito(data: dict, tier: str) -> float:
    components = {}
    
    # --- FREE components (weight: 1.0 total) ---
    # Embargos IBAMA (0 or 1 active = big impact)
    embargos = data.get("embargos", [])
    components["embargos"] = 1000 if len(embargos) == 0 else max(0, 500 - len(embargos) * 250)
    
    # Sanções (CEIS/CNEP)
    sancoes = data.get("sancoes", [])
    components["sancoes"] = 1000 if len(sancoes) == 0 else 0
    
    # Endividamento rural (SICOR volume vs produção)
    credito = data.get("credito_rural_5a", 0)
    producao = data.get("valor_producao_5a", 1)
    ratio = credito / producao if producao > 0 else 999
    components["endividamento"] = max(0, min(1000, 1000 - ratio * 200))
    
    if tier == "FREE":
        weights = {"embargos": 0.35, "sancoes": 0.25, "endividamento": 0.40}
        return sum(components[k] * weights[k] for k in weights)
    
    # --- PRO components (rebalanced weights) ---
    # Protestos
    protestos = data.get("protestos", {})
    n_protestos = protestos.get("total", 0)
    components["protestos"] = max(0, 1000 - n_protestos * 200)
    
    # Processos judiciais (RJ = catastrophic)
    processos = data.get("processos", [])
    has_rj = any(p.get("classe") == "recuperacao_judicial" for p in processos)
    components["judiciais"] = 0 if has_rj else max(0, 1000 - len(processos) * 100)
    
    if tier == "PRO":
        weights = {
            "embargos": 0.15, "sancoes": 0.10, "endividamento": 0.25,
            "protestos": 0.30, "judiciais": 0.20
        }
        return sum(components[k] * weights[k] for k in weights)
    
    # --- PREMIUM components ---
    # CPR exposure (CERC)
    cpr = data.get("exposicao_cpr", {})
    safra_comprometida = cpr.get("safra_comprometida_pct", 0) / 100
    components["cpr_exposure"] = max(0, 1000 * (1 - safra_comprometida))
    
    # Serasa Agro Score (normalized to 0-1000)
    serasa = data.get("score_serasa", {}).get("agro_score", 500)
    components["serasa"] = serasa
    
    weights = {
        "embargos": 0.10, "sancoes": 0.05, "endividamento": 0.15,
        "protestos": 0.20, "judiciais": 0.15,
        "cpr_exposure": 0.20, "serasa": 0.15
    }
    return sum(components[k] * weights[k] for k in weights)
```

### Score Lavoura (X axis, 0–2.0)

```python
def calculate_score_lavoura(data: dict, tier: str) -> float:
    components = {}
    
    # --- FREE: only regional/historical data ---
    prod = data.get("produtividade_municipal", {})
    components["produtividade"] = min(2.0, prod.get("atual", 1.0) / prod.get("media_5a", 1.0))
    
    meteo = data.get("meteorologia", {})
    precip_ratio = meteo.get("acumulada", 1) / meteo.get("normal", 1) if meteo.get("normal", 0) > 0 else 1.0
    components["clima"] = min(2.0, max(0.3, precip_ratio))
    
    if tier == "FREE":
        return (components["produtividade"] * 0.6 + components["clima"] * 0.4)
    
    # --- PRO: add NDVI ---
    ndvi = data.get("ndvi", {})
    ndvi_ratio = ndvi.get("atual", 0.65) / ndvi.get("historico", 0.65) if ndvi.get("historico", 0) > 0 else 1.0
    components["ndvi"] = min(2.0, max(0.3, ndvi_ratio))
    
    seguro = data.get("seguro_rural", {})
    components["seguro"] = 1.3 if seguro.get("ativo") else 0.8
    
    if tier == "PRO":
        return (components["produtividade"] * 0.25 + components["clima"] * 0.20 + 
                components["ndvi"] * 0.40 + components["seguro"] * 0.15)
    
    # --- PREMIUM: add compliance ---
    compliance = data.get("compliance_ambiental", {})
    components["compliance"] = 1.5 if compliance.get("eudr_compliant") else 0.5
    
    zarc = data.get("zarc", {})
    components["zarc"] = 1.3 if zarc.get("janela_ok") else 0.7
    
    return (components["produtividade"] * 0.15 + components["clima"] * 0.15 +
            components["ndvi"] * 0.30 + components["seguro"] * 0.15 +
            components["compliance"] * 0.15 + components["zarc"] * 0.10)
```

---

## 10. Deployment & Infrastructure

### Minimum Production Setup

| Service | Spec | Cost/month |
|---------|------|-----------|
| App Server (FastAPI) | 2× t3.large (2 vCPU, 8GB) | R$600 |
| PostgreSQL + PostGIS | db.r6g.large (2 vCPU, 16GB, 200GB SSD) | R$1.200 |
| Redis | cache.t3.medium (2 vCPU, 3GB) | R$300 |
| Airflow | t3.medium (2 vCPU, 4GB) | R$300 |
| S3 Storage | 500GB (shapefiles, GeoTIFFs, raw CSVs) | R$60 |
| Load Balancer + SSL | ALB | R$100 |
| Monitoring | Grafana Cloud Free | R$0 |
| **Total infra** | | **~R$2.560/mês** |

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://agsf:***@db:5432/datalake

# Redis
REDIS_URL=redis://cache:6379/0

# External APIs (Tier PRO)
REGISTRO_RURAL_TOKEN=rr_live_xxxxx
INFOSIMPLES_TOKEN=is_xxxxx
BIGDATACORP_TOKEN=bdc_xxxxx
SENTINEL_HUB_CLIENT_ID=sh_xxxxx
SENTINEL_HUB_CLIENT_SECRET=sh_secret_xxxxx

# External APIs (Tier PREMIUM)
CERC_API_KEY=cerc_xxxxx
CERC_CERT_PATH=/certs/cerc.pem
SERASA_CLIENT_ID=serasa_xxxxx
SERASA_CLIENT_SECRET=serasa_secret_xxxxx
NEOWAY_API_KEY=neoway_xxxxx
ONR_CERT_PATH=/certs/onr.pem

# Billing
BILLING_ENABLED=true
BILLING_LOG_TABLE=billing_queries
```

---

## 11. Data Source Reference (Quick Lookup)

### Free Sources (21 total)

| # | Source | URL | Method | Update | Key field |
|---|--------|-----|--------|--------|-----------|
| 1 | BACEN SICOR | olinda.bcb.gov.br/olinda/servico/SICOR/ | OData REST | Monthly | id_municipio |
| 2 | BACEN SGS | api.bcb.gov.br/dados/serie/ | REST | Daily | serie_id |
| 3 | IBGE SIDRA PAM | apisidra.ibge.gov.br | REST | Annual | id_municipio |
| 4 | IBGE SIDRA LSPA | apisidra.ibge.gov.br | REST | Monthly | uf |
| 5 | IBGE PPM | apisidra.ibge.gov.br | REST | Annual | id_municipio |
| 6 | CONAB Safra | portaldeinformacoes.conab.gov.br | Bulk download | Monthly | uf |
| 7 | CONAB Preços | portaldeinformacoes.conab.gov.br | Bulk download | Weekly | id_municipio |
| 8 | IBAMA Embargos | dadosabertos.ibama.gov.br | CKAN + WFS | Daily | cpf_cnpj |
| 9 | INPE PRODES | terrabrasilis.dpi.inpe.br | WFS + REST | Annual | geometry |
| 10 | INPE DETER | terrabrasilis.dpi.inpe.br | WFS | Daily | geometry |
| 11 | CAR/SICAR | car.gov.br | Shapefile + WFS | Quarterly | farm_id |
| 12 | INMET | apitempo.inmet.gov.br | REST | Hourly | estacao_id |
| 13 | Receita Federal CNPJ | arquivos.receitafederal.gov.br | Bulk CSV | Monthly | cnpj |
| 14 | Portal Transparência | portaldatransparencia.gov.br/api-de-dados | REST | Monthly | cpf_cnpj |
| 15 | DataJud/CNJ | api-publica.datajud.cnj.jus.br | REST (ES) | Daily | cpf_cnpj* |
| 16 | MapBiomas | data.mapbiomas.org | GeoTIFF + GEE | Annual | geometry |
| 17 | MAPA ZARC | dados.agricultura.gov.br | CSV | Seasonal | id_municipio |
| 18 | MAPA SISSER/PSR | dados.agricultura.gov.br | CSV | Seasonal | id_municipio |
| 19 | CVM FIAGRO | dados.cvm.gov.br | Bulk CSV | Monthly | cnpj_fundo |
| 20 | SUSEP Seguro Rural | susep.gov.br | CSV | Monthly | id_municipio |
| 21 | TSE/PEP | dadosabertos.tse.jus.br | Bulk CSV | Election cycle | cpf |

### Pay-per-query Sources (8 total)

| # | Source | Docs URL | Cost/query | Key field |
|---|--------|----------|-----------|-----------|
| 1 | Registro Rural | docs.registrorural.com.br | R$0.30–1.50 | cpf_cnpj / farm_id |
| 2 | Infosimples Protestos | api.infosimples.com | R$0.50–1.50 | cpf_cnpj |
| 3 | Infosimples CNPJ | api.infosimples.com | R$0.15–0.60 | cnpj |
| 4 | Infosimples CND | api.infosimples.com | R$0.30–0.80 | cpf_cnpj |
| 5 | BigDataCorp | docs.bigdatacorp.com.br | R$0.05–0.50 | cpf_cnpj |
| 6 | Sentinel Hub | sentinel-hub.com | ~R$0.02–0.10/polygon | geometry |
| 7 | Quod | quod.com.br | R$1.00–5.00 | cpf_cnpj |
| 8 | SPC Brasil | spcbrasil.com.br | R$0.50–3.00 | cpf_cnpj |

### Enterprise Sources (7 total)

| # | Source | URL | Contract model | Key field |
|---|--------|-----|---------------|-----------|
| 1 | CERC | api.cerc.inf.br | Monthly + per-tx | cpf_cnpj |
| 2 | Serasa Experian Agro | serasaexperian.com.br | Enterprise | cpf_cnpj |
| 3 | Neoway | neoway.com.br | SaaS subscription | cpf_cnpj |
| 4 | ONR/CNIB | indisponibilidade.onr.org.br | Contract + ICP-Brasil | cpf_cnpj |
| 5 | Agrotools | agrotools.com.br | Enterprise | farm_id / geometry |
| 6 | Planet Labs | planet.com | Annual HUM | geometry |
| 7 | Aliare | aliare.co | Partnership | erp_integration |

---

*Documento técnico AgriSafe. Para estratégia de produto e unit economics, ver `AGSF_Datalake_PRODUCT.md`.*
