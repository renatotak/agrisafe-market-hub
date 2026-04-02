# AgriSafe Datalake — Product Strategy & Unit Economics

> **Documento de produto.** Define o que vendemos, para quem, por quanto, e como cada tier gera receita.
> **Companion doc:** `AGSF_Datalake_INFRA.md` (arquitetura técnica e endpoints)
>
> Março 2026 | Confidencial

---

## 1. Princípio Fundamental de Produto

**Todo journey do usuário começa com uma pergunta sobre alguém ou algum lugar:**

- "Qual o risco do CPF 123.456.789-00?"
- "A fazenda MT-5101-ABC está com a lavoura saudável?"
- "O CNPJ 12.345.678/0001-99 tem protestos?"

O produto AgriSafe nunca pede ao usuário que escolha uma fonte de dados ou entenda de onde vem a informação. O usuário digita um **CPF**, **CNPJ** ou **ID de fazenda (código CAR)** e recebe um resultado unificado. A complexidade do datalake é invisível.

Essa premissa simplifica o onboarding (nenhum treinamento necessário), reduz fricção de adoção (funciona como uma busca do Google), e permite upsell natural (o resultado FREE mostra o que o PRO desbloquearia).

---

## 2. Arquitetura de Tiers

### Visão Geral

| | FREE | PRO | PREMIUM |
|---|---|---|---|
| **Nome comercial** | AgriSafe Field | AgriSafe Intelligence | AgriSafe Oracle |
| **Input** | CPF/CNPJ/Farm ID | CPF/CNPJ/Farm ID | CPF/CNPJ/Farm ID + Carteira |
| **Fontes** | 21 fontes públicas gratuitas | Free + 8 fontes pay-per-query | Pro + 7 fontes enterprise |
| **Custo variável AGSF** | R$0 | R$0,30–8,00 por consulta completa | R$15k–50k/mês fixo |
| **Preço ao cliente** | Gratuito | R$2.000–5.000/mês | R$15.000–30.000/mês |
| **Canal de venda** | Self-service (app/web) | Inside sales (1-2 reuniões) | Consultive sales (Renato/Ivan) |
| **Aprovação do cliente** | Nenhuma | Alçada do gerente | Alçada do diretor |
| **Lock-in** | Dados capturados (visitas, fotos) | Histórico de consultas + workflow | Dados proprietários + integração |

### Dinâmica entre Tiers

```
FREE (captura)                  PRO (monetiza)              PREMIUM (escala)
─────────────────             ──────────────────           ──────────────────
RTV usa o app             →   Gestor vê os dados     →   Diretor quer ICS +
Score básico gratuito          que os RTVs geraram         Fairness Opinion para
Gera dados proprietários       Pede dashboard PRO          apresentar ao board
                               R$2-5k/mês                  R$15-30k/mês

Custo AGSF: R$0                Custo AGSF: ~R$500/mês     Custo AGSF: ~R$30k/mês
Receita: R$0                   Margem: 75-90%              Margem: 40-60%
Valor: dados capturados        Valor: receita recorrente   Valor: anchor revenue
```

---

## 3. Personas e Jornadas

### 3.1 RTV (Representante Técnico de Vendas) → FREE

**Quem é:** Vendedor de campo de revenda de insumos ou cooperativa. Roda 500–800 km/semana. Usa 3–5 apps no celular. Resistente a mais um sistema.

**Dor resolvida:** "Pra quem eu devo ir hoje?"

**Jornada no produto:**

| Momento | O que vê | O que faz | Dado capturado |
|---------|----------|-----------|---------------|
| 6h da manhã | "Bom dia, Davi. 4 visitas priorizadas hoje." | Aceita roteiro | Geolocalização |
| Antes da visita | Ficha do produtor: Score básico + NDVI + alertas | Prepara abordagem | — |
| Durante a visita | Formulário simplificado (3 toques) | Foto da lavoura + resultado (dropdown) + voz | Foto georreferenciada, feedback de campo, intenção de compra |
| Pós-visita | Resumo enviado ao gestor automaticamente | Segue pro próximo | Relatório de visita |

**Métricas de valor:**
- Antes: 10 visitas/dia, 2 fechamentos (20% conversão)
- Depois: 6 visitas/dia, 4 fechamentos (67% conversão)
- ROI: -40% km rodados, +100% conversão

**Gancho de upsell:** O gestor do RTV vê os dados agregados de todas as visitas e pede acesso PRO.

---

### 3.2 Analista de Crédito de Revenda → PRO

**Quem é:** Profissional que aprova ou rejeita pedidos de crédito na revenda. Consulta bureaus manualmente. Precisa de velocidade.

**Dor resolvida:** "Posso aprovar esse produtor? Em quanto tempo?"

**Jornada no produto:**

| Momento | Input | Output | Tempo |
|---------|-------|--------|-------|
| Pedido de crédito chega | Digita CPF do produtor | Score AGSF dual-axis + quadrante (Q1-Q4) | 3 segundos |
| Score no quadrante Q1 | — | "Aprovado: alta confiabilidade + boa lavoura. Limite sugerido: R$X" | Automático |
| Score no quadrante Q2 | — | "Atenção: boa lavoura, mas score financeiro comprometido. 3 protestos ativos. Sugestão: garantia adicional." | 10 segundos de leitura |
| Score no quadrante Q4 | — | "Alto risco: 2 embargos IBAMA + NDVI abaixo da média + 5 protestos. Recomendação: recusar ou exigir CPR com registro B3." | 10 segundos |
| Quer mais detalhe | Clica "Ver relatório completo" | PDF: due diligence com todas as fontes consultadas | 5 segundos (geração) |

**Métricas de valor:**
- Antes: 45 min/análise (consulta manual em 5+ sistemas)
- Depois: 30 segundos/análise (uma busca, um resultado)
- Capacidade: de 10 análises/dia para 80 análises/dia
- Default rate: de 15% para projetado 5% (melhor seleção)

**O que o relatório PRO mostra (que o FREE não mostra):**
- Protestos ativos e valores (Infosimples/CENPROT)
- Propriedades rurais vinculadas ao CPF (Registro Rural: CAR + SNCR + SIGEF)
- NDVI atual da fazenda vs média histórica (Sentinel Hub)
- Situação cadastral detalhada (BigDataCorp)
- Telefone e endereço atualizados (para cobrança)

---

### 3.3 Gerente de Crédito / CFO de Revenda → PRO

**Quem é:** Responsável pela carteira de crédito. Responde pelo P&L do default. Reporta ao board.

**Dor resolvida:** "Qual o valor real da minha carteira? Onde estão os riscos?"

**Jornada no produto:**

| Funcionalidade | O que entrega | Frequência |
|---------------|--------------|-----------|
| Precificação de carteira (quadrantes) | Valor nominal vs valor ajustado ao risco (Q1-Q4) | Mensal |
| Heatmap de risco regional | Municípios com concentração de inadimplência emergente | Semanal |
| Alertas de deterioração | "3 produtores da região X atrasaram pagamento esta semana" | Real-time |
| Benchmark regional | "Sua inadimplência está 2pp acima da média da região" | Mensal |
| Relatório para board | PDF executivo com evolução da carteira | Mensal |

**Métricas de valor:**
- PDD reduzida de 15% para 5–8% → em carteira de R$100M = R$7–10M liberados
- Custo do serviço PRO: R$5k/mês = R$60k/ano
- ROI: 116x–166x

---

### 3.4 Diretor de Risco (CRO) de Banco / Gestor de Fiagro → PREMIUM

**Quem é:** Responsável por carteira agro de R$500M–R$5B. Precisa de compliance CMN 4.966 e governança para cotistas/regulador.

**Dor resolvida:** "Minha carteira de CPRs está segura? As garantias existem? Quanto devo provisionar?"

**Jornada no produto:**

| Funcionalidade | O que entrega | Diferencial vs concorrência |
|---------------|--------------|---------------------------|
| **ICS — Índice de Comprometimento de Safra** | Por município × cultura: % da safra já comprometida em CPRs. Heatmap de sobreposição. | Único no mercado. Tarken não tem. Nagro não tem. Usa dados CERC proprietários |
| **Fairness Opinion automatizado** | Laudo mensal: cada CPR da carteira com evidência biológica (NDVI) e geográfica (CAR polygon) de que a garantia existe | Entrega em 4 dias (vs semanas manual). Compliance CMN 4.966 |
| **Exposição CPR cross-credor** | "Este produtor emitiu CPRs para 3 outros credores totalizando R$X — safra comprometida em Y%" | CERC data que nenhum concorrente acessa da mesma forma |
| **Monitoramento contínuo** | Alertas: novo embargo IBAMA, novo processo judicial, NDVI anormal, nova CPR emitida | Cobertura diária vs eventual |
| **Dashboard de governança** | Relatórios para cotistas de Fiagro com métricas de risco padronizadas | Substitui consultoria ad hoc |

**Métricas de valor:**
- 1% de redução de PDD sobre carteira de R$500M = R$5M liberados em liquidez
- Custo PREMIUM: R$25k/mês = R$300k/ano
- ROI: 16x
- Compliance CMN 4.966 evita autuação do BCB (risco regulatório incalculável)

**Narrativa de vendas para CRO:**
> *"Enquanto você provisiona o máximo porque não consegue provar que a garantia existe, nós entregamos a prova biológica e geográfica mensal de cada CPR da sua carteira. Isso libera capital e satisfaz a 4.966."*

---

### 3.5 CCO / CEO de Revenda → PREMIUM (Mapeamento de Acesso)

**Quem é:** Responsável pela estratégia comercial. Quer vender mais com menos custo.

**Dor resolvida:** "Onde estão as melhores oportunidades e como aloco meu time?"

**Jornada:** Gestão Territorial → FFE → Acompanhamento Comercial (ciclo completo da Metodologia Crosara)

| Entrega | Input | Output |
|---------|-------|--------|
| Potencial de mercado por município | Região de atuação | R$/ha potencial × cultura × segmento (defensivos, sementes, fertilizantes) |
| Dimensionamento de equipe | # de RTVs + região | # ideal de RTVs por cluster, frequência de visitas, calendário agrícola |
| Lista de leads qualificados | Região + cultura + porte | Ranking de produtores por propensão de compra × capacidade de pagamento |
| Acompanhamento síncrono | App Field em uso | Mapa de progresso: planejado vs visitado vs convertido |

**Métricas de valor:**
- +35% conversão de vendas
- -40% custos logísticos ("turismo rural" eliminado)
- Resultado visível no primeiro mês

---

## 4. Unit Economics por Tier

### 4.1 FREE — Modelo de Captura

| Métrica | Valor |
|---------|-------|
| CAC (custo de aquisição) | ~R$0 (orgânico via boca a boca de RTVs) |
| Custo de servir/mês | ~R$5/usuário (infra compartilhada) |
| Revenue direto | R$0 |
| Revenue indireto | Cada RTV gera ~20 interações/mês = 20 data points proprietários |
| 500 RTVs × 20 = 10.000 data points/mês | Combustível para Score AGSF e flywheel |
| Conversão FREE→PRO estimada | 5–10% dos gestores que veem os dados pedem PRO |

### 4.2 PRO — Modelo de Margem Alta

| Métrica | Valor |
|---------|-------|
| Ticket médio | R$3.500/mês |
| Custo variável de dados/cliente | R$200–800/mês (depende de volume de consultas) |
| Margem de contribuição | 77–94% |
| CAC estimado | R$5.000–10.000 (1-2 reuniões inside sales) |
| Payback | 1,5–3 meses |
| LTV (24 meses, 5% churn) | R$80.000+ |
| LTV/CAC | 8x–16x |

**Decomposição de custo variável por consulta completa (Score AGSF + Due Diligence):**

| Fonte consultada | Custo/consulta | Trigger |
|-----------------|---------------|---------|
| SICOR/IBGE/IBAMA/INMET | R$0,00 | Sempre (dados próprios do datalake) |
| Registro Rural (CAR+SNCR) | R$0,30–1,50 | Sempre que há CPF/CNPJ |
| Infosimples — Protestos | R$0,50–1,50 | Sempre |
| Infosimples — CNPJ | R$0,15–0,60 | Se input = CNPJ |
| Infosimples — CND Federal | R$0,30–0,80 | Se operação > R$100k |
| BigDataCorp — Enriquecimento | R$0,05–0,50 | Sempre (telefone + endereço) |
| Sentinel Hub — NDVI | R$0,02–0,10 | Se Farm ID disponível |
| **Total por consulta completa** | **R$1,32–4,50** | |
| **Preço cobrado ao cliente/consulta** | **R$10–25** (embutido na mensalidade) | |

**Cenário: cliente com 200 consultas/mês**
- Receita: R$3.500/mês (mensalidade)
- Custo dados: 200 × R$3,00 = R$600/mês
- Margem: R$2.900 (83%)

### 4.3 PREMIUM — Modelo de Anchor Revenue

| Métrica | Valor |
|---------|-------|
| Ticket médio | R$22.500/mês |
| Custo fixo de dados (rateio) | R$6.000–12.000/mês/cliente (depende de # clientes) |
| Margem de contribuição | 47–73% |
| CAC estimado | R$30.000–50.000 (sales consultivo, 2-3 meses) |
| Payback | 1,5–2 meses |
| LTV (36 meses, 3% churn) | R$750.000+ |
| LTV/CAC | 15x–25x |

**Efeito de escala nos custos fixos enterprise:**

| # Clientes Premium | Custo CERC+Serasa+Neoway/cliente | Margem |
|--------------------|-------------------------------|--------|
| 3 | R$13.000/mês | 42% |
| 6 | R$6.500/mês | 71% |
| 10 | R$4.000/mês | 82% |

---

## 5. Go-to-Market Strategy

### 5.1 Canais por Tier

| Tier | Canal primário | Tática | Meta M6 | Meta M12 |
|------|---------------|--------|---------|----------|
| FREE | WhatsApp groups de RTVs + LinkedIn agro | "App que diz pra onde ir hoje" — viral entre vendedores de campo | 300 RTVs | 800 RTVs |
| PRO | Inside sales (Davi Domingues) + referral de RTVs | Demo de 15 min mostrando Score AGSF com dados reais do prospect | 15 clientes | 35 clientes |
| PREMIUM | Consultive sales (Renato + Ivan) + eventos Fiagro | Fairness Opinion pontual como porta de entrada (R$5k) | 3 clientes | 6 clientes |

### 5.2 GTM Calendar (Sincronizado com Calendário Agrícola)

| Período | Fase agrícola | Produto a empurrar | Ação |
|---------|--------------|-------------------|------|
| **Mar–Mai** | Pós-colheita soja safra / Plantio safrinha | BPO Cobrança (safra vencida) + Score AGSF | Campanha: "Hora de cobrar a safra. Sem desgastar o vendedor." |
| **Jun–Ago** | Pré-planejamento safra seguinte | Mapeamento de Acesso + Field App | Campanha: "Planeje sua safra 25/26 com dados, não com intuição." |
| **Set–Nov** | Pré-plantio safra / Emissão de CPRs | CPR Hub + Score AGSF para aprovação | Campanha: "Aprove crédito em 30 segundos. Registre CPR em 24h." |
| **Dez–Fev** | Fase vegetativa / Monitoramento | Fairness Opinion + Regional Risk | Campanha: "Sua garantia está viva? Temos a prova satelital." |

### 5.3 Pricing Strategy: Abaixo do Threshold

**Princípio:** Todo produto PRO custa menos que o limite de alçada do gerente para evitar comitê de compras.

| Tipo de empresa | Threshold estimado | Produto | Preço |
|----------------|-------------------|---------|-------|
| Revenda média | R$5.000/mês | Score AGSF + alertas | R$2.000–3.000/mês |
| Revenda grande | R$10.000/mês | Score + Precificação de carteira | R$5.000–8.000/mês |
| Cooperativa | R$10.000/mês | Score + Monitoramento NDVI | R$5.000–8.000/mês |
| Banco/Fiagro | R$50.000/mês | ICS + Fairness Opinion | R$15.000–30.000/mês |

### 5.4 Narrativa de Diferenciação por Concorrente

**Quando o prospect "já tem Tarken":**
> *"A Tarken te diz se o produtor é bom pagador. Nós te dizemos se a região inteira vai pagar. São camadas complementares — a Tarken olha pra dentro da sua carteira, nós olhamos pra fora."*

Tática: Posicionar como complemento, não substituto. Preço PRO (R$3k) + Tarken (R$Xk) < contratar consultoria ad hoc.

**Quando o prospect "já tem Nagro/AGRisk":**
> *"A Nagro faz scoring individual e empresta capital. Nós mostramos o risco sistêmico regional — quantos produtores daquela microrregião já comprometeram a safra inteira antes de colher. Isso nenhum score individual revela."*

**Quando o prospect "já tem TM Digital":**
> *"A TM validou seu modelo gerindo R$1,4B em FIDCs. Nós trazemos uma camada que eles não têm: dados CERC transformados em ICS. É a visão de alavancagem total do produtor que nenhum monitor de carteira entrega."*

---

## 6. Flywheel de Dados (Moat Acumulativo)

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   RTVs usando Field App                                  │
│   (dados de visita, fotos, feedback)                     │
│          │                                               │
│          ▼                                               │
│   Enriquece Score AGSF                                   │
│   (dados de campo = sinal alternativo de crédito)        │
│          │                                               │
│          ▼                                               │
│   Atrai Fiagros/IFs que querem dados de campo            │
│   (pagam PREMIUM por inteligência proprietária)          │
│          │                                               │
│          ▼                                               │
│   Receita PREMIUM financia mais features no app          │
│   (mais valor → mais RTVs → mais dados)                  │
│          │                                               │
│          └──────────────────────────────────────────────  │
│                                                          │
│   BPO Cobrança                                           │
│   (dados de comportamento de pagamento)                  │
│          │                                               │
│          ▼                                               │
│   Enriquece modelo preditivo de inadimplência            │
│   (taxa de sucesso por perfil = dado proprietário)       │
│          │                                               │
│          ▼                                               │
│   Atrai revendas que querem PREVENIR (não só cobrar)     │
│   (upsell PRO: Score + Precificação)                     │
│          │                                               │
│          ▼                                               │
│   Mais dados de carteira → modelo mais preciso           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Por que isso é não-substituível por IA:**
Um LLM replica a lógica consultiva. Não replica 10.000 relatórios de visita georreferenciados/mês, 500 históricos de cobrança com taxa de sucesso, e cruzamento proprietário CERC + NDVI + campo.

---

## 7. Projeção de Receita (12 meses)

### Cenário Base

| Produto | Tier | Ticket/mês | Clientes M6 | Clientes M12 | MRR M6 | MRR M12 |
|---------|------|-----------|-------------|-------------|--------|---------|
| AgriSafe Field (app) | FREE | R$0 | 300 RTVs | 800 RTVs | R$0 | R$0 |
| Score AGSF + Alertas | PRO | R$2.500 | 8 | 20 | R$20k | R$50k |
| Precificação de Carteira | PRO | R$5.000 | 5 | 12 | R$25k | R$60k |
| BPO Cobrança | PRO* | R$8.000 + variável | 5 | 12 | R$40k | R$96k |
| Fairness Opinion | PREMIUM | R$20.000 | 3 | 6 | R$60k | R$120k |
| Regional Risk (ICS) | PREMIUM | R$20.000 | 2 | 4 | R$40k | R$80k |
| CPR Hub | PREMIUM | R$15.000 | 2 | 5 | R$30k | R$75k |
| **TOTAL** | | | | | **R$215k** | **R$481k** |

*BPO Cobrança tem success fee adicional (1-3% sobre recuperado) não incluído no MRR base.

### Breakeven Analysis

| Item | Custo mensal |
|------|-------------|
| Infra (compute + storage + APIs gov) | R$5.000 |
| Fontes PRO variáveis (escala M12) | R$15.000 |
| Fontes PREMIUM fixas (CERC + Serasa + Neoway) | R$40.000 |
| Time (dev + ops + comercial) | R$80.000 |
| **Total custo operacional** | **R$140.000** |
| **MRR necessário para breakeven** | **R$140.000** |
| **Mês estimado de breakeven** | **M7–M8** |

---

## 8. Diferencial Competitivo por Produto

| Produto AgriSafe | O que entrega | O que Tarken NÃO faz | O que Nagro NÃO faz | O que TM Digital NÃO faz |
|-----------------|--------------|---------------------|--------------------|-----------------------|
| Score AGSF (dual-axis) | Crédito × Lavoura em 4 quadrantes | Não cruza score financeiro com score de lavoura | Não tem score de lavoura | Não tem scoring próprio |
| ICS (CERC + NDVI) | Comprometimento de safra por região | Sem dados CERC regionais | Sem análise regional | Sem ICS |
| Field App para RTV | "Pra onde ir hoje?" | Radar Tarken é pro gestor, não pro RTV | Não tem app de campo | Não tem app de campo |
| Metodologia Crosara | Dimensionamento de equipe + território | Não faz | Não faz | Parcial |
| BPO Cobrança IA/WhatsApp | Cobrança sem desgastar vendedor | Não faz cobrança | Não faz cobrança | Cobrança as a Service (concorre) |
| Fairness Opinion | Laudo com evidência biológica a cada 4 dias | Parceria NDVI mas sem laudo | Sem laudo satelital | Monitor interno (não vende) |

---

## 9. Regras de Negócio por Quadrante (Score AGSF)

O Score AGSF posiciona cada produtor em um de 4 quadrantes baseado em dois eixos:
- **Eixo Y (Score Crédito AGSF):** threshold = 500 pontos
- **Eixo X (Score Lavoura):** threshold = 1,0

| Quadrante | Perfil | Policy automática | Ação sugerida |
|-----------|--------|------------------|--------------|
| **Q1** (Y≥500, X≥1) | Alta confiabilidade + boa lavoura | Aprovação automática. Condições otimizadas. Máxima flexibilidade | Vender mais |
| **Q2** (Y<500, X≥1) | Baixa confiabilidade + boa lavoura | Aprovação com garantias adicionais. CPR registrada obrigatória | Monitorar de perto |
| **Q3** (Y≥500, X<1) | Boa confiabilidade + lavoura ruim | Renegociação. Ajustar estratégia de recebimento | Proteger carteira |
| **Q4** (Y<500, X<1) | Baixa confiabilidade + lavoura ruim | Rejeição ou medidas rigorosas. Priorizar recuperação | Minimizar perdas |

**Precificação automática por quadrante (exemplo):**

| Quadrante | Valor nominal | Haircut | Valor ajustado |
|-----------|--------------|---------|---------------|
| Q1 | R$700,5M | 0% | R$700,5M |
| Q2 | R$319,7M | 20,6% | R$253,8M |
| Q3 | R$150,6M | 34,7% | R$98,3M |
| Q4 | R$53,8M | 100% | R$0 |

---

## 10. Métricas de Sucesso do Produto

| Métrica | FREE | PRO | PREMIUM |
|---------|------|-----|---------|
| **North Star** | # RTVs ativos/mês | NRR (Net Revenue Retention) | Carteira total sob monitoramento (R$) |
| **Activation** | 1ª consulta de Score em 24h | 1ª precificação de carteira em 7 dias | 1º Fairness Opinion entregue em 30 dias |
| **Engagement** | ≥15 interações/mês/RTV | ≥50 consultas/mês/cliente | ≥1 relatório mensal gerado |
| **Retention** | MAU/DAU ≥ 30% | Churn ≤ 5%/mês | Churn ≤ 3%/mês |
| **Revenue** | Conversão FREE→PRO ≥ 5% | ARPU ≥ R$3.500/mês | ARPU ≥ R$22.500/mês |

---

*Documento de produto AgriSafe. Para detalhes técnicos de implementação, endpoints e mocked data, ver `AGSF_Datalake_INFRA.md`.*
