# Affiliate Network Platform — Development Proposal

**Project:** Big4Partners
**Date:** 18 June 2026  ·  **Version:** 1.0  ·  **Validity:** 30 days

---

## 1. Overview

This proposal covers the design and delivery of a purpose-built **affiliate management
platform for the iGaming industry**, developed from the ground up. The platform manages
the full affiliate lifecycle — operator and brand setup, affiliate onboarding, campaign
discovery, conversion tracking, commission calculation, data reconciliation, and financial
settlement.

The platform implements the three-party network model: operators fund player acquisition,
affiliates drive traffic, and the network tracks conversions, enforces deal terms, and
settles payments to all parties — retaining a configurable margin on each marketing source.

The system is delivered as a set of independent, horizontally scalable services with a
modern web back-office and a dedicated affiliate portal.

---

## 2. Team

| Code | Role |
|------|------|
| **SF** | Senior full-stack / tech lead — architecture, high-throughput services, integrations, code review |
| **MF** | Mid-level full-stack — feature backend + integrations |
| **JF** | Frontend engineer — web application, reporting UI |
| **QA** _(part-time)_ | QA / tester — test plans, regression, UAT support; engaged across all phases, full-time during hardening |

---

## 3. Service Architecture & Technology

| #  | Service | Responsibility | Tech | Owner |
|----|---------|----------------|------|-------|
| 1  | **API Gateway** | Routing, auth propagation, rate-limiting | Traefik / Fastify gateway | SF · QA |
| 2  | **Identity & Tenancy** | Auth, role-based access control (permission groups), operator, brand, admin, affiliate invite | Node.js (Express) + MongoDB + Redis | MF · SF · QA |
| 3  | **Tracking & Marketing Source** | Marketing-source entity, dual-deal/margin model, channel, tracker link, short link | Node.js (Express) + MongoDB | SF · MF · QA |
| 4  | **Marketplace** | Campaign discovery, join-request, approval → auto-create marketing source | Node.js (Express) + MongoDB | MF · SF · QA |
| 5  | **Ingestion & Stats** | Tracker-ID postback endpoint (fact table) + aggregation + all stats/reporting queries. **Dual-mode feed:** real-time stream push OR nightly API pull. | **Go** + ClickHouse + Kafka | SF · QA |
| 6  | **ETL Adapter** | Pluggable operator back-office pull (Softswiss / EveryMatrix / Digitain…), scheduled jobs, encrypted credentials | **Go** + MongoDB (job state) | SF · QA |
| 7  | **Commission Engine** | CPA with monthly caps, Revenue Share with carry-over/baseline, Hybrid, dual-deal calculation, idempotent month-end batch | Node.js worker + MongoDB | SF · MF · QA |
| 8  | **Reconciliation** | Data reconciliation: three-layer model, monthly snapshot lock, gap & retroactive-change detection | **Go** + ClickHouse | SF · QA |
| 9  | **Billing & Invoicing** | Operator invoices, affiliate payouts/statements, multi-currency | Node.js + MongoDB | MF · SF · QA |
| 10 | **Payment** | Pluggable payment-provider (PSP) integration | Node.js + provider SDK | MF · SF · QA |
| 11 | **Back-office Web App** | Operator/admin application | React + TypeScript + React Query | JF · SF · QA |
| 12 | **Affiliate Portal** | Restricted affiliate-facing application | React + TypeScript + React Query | JF · SF · QA |

**Environments:** two isolated deployments — **Staging** (every change is tested here first)
and **Production**, with a promote-from-staging release flow. The architecture is decomposed
into independent microservices to allow each to scale and deploy on its own.

**Shared infrastructure:** containerized services for staging↔production parity —
Docker + Compose (staging) / Kubernetes or k3s (production), Kafka, MongoDB, ClickHouse,
Redis, CI/CD (GitHub Actions) with automated staging deploy and gated promotion to production.

> **Dual-mode ingestion — selected per operator account:**
> 1. **Stream push** — operators able to publish aggregated events stream them to a topic; the Go ingestion service consumes and writes to the fact table in real time.
> 2. **Nightly API pull (ETL adapter)** — operators integrated via encrypted-credential adapters that pull player/revenue data on a schedule.
>
> Both modes land in the same ClickHouse fact table, so stats, commission, and
> reconciliation are feed-agnostic. The network's own attribution always arrives via the
> Tracker-ID postback endpoint regardless of mode.

---

## 4. Scope & Work Breakdown

> SF (senior full-stack / tech lead) owns architecture and code review on **every module
> across all phases**; the Owner column lists the primary implementer alongside SF.
> QA/tester (part-time) is engaged **across every phase** for test coverage and regression,
> and works full-time during the hardening phase.

| Phase | Module | Service | Owner | Tech | Effort (dev-wk) |
|-------|--------|---------|-------|------|-----------------|
| **P0 Foundation** | Monorepo, base CI, Docker images, local dev (Compose) bootstrap | infra | SF · QA | GH Actions, Docker | 1 |
| | **CI/CD + orchestration: per-service pipelines, k8s/k3s manifests, Staging + Production envs, promote-from-staging flow** | infra | SF · MF · QA | GH Actions, k8s/k3s, Compose | 2 |
| | API Gateway + auth propagation | 1 | SF · QA | Traefik/Fastify | 1 |
| | Auth + granular RBAC (permission groups) | 2 | MF · SF · QA | Node, Mongo | 3 |
| | Operator / Brand / admin login | 2 | MF · SF · QA | Node, Mongo | 2 |
| | Affiliate invite + onboarding | 2 | MF · SF · QA | Node | 1 |
| | Web app shell + design system + auth screens | 11 | JF · SF · QA | React, React Query | 3 |
| | Go ingestion+stats skeleton + stream consumer + postback endpoint + schema | 5 | SF · QA | Go, CH, Kafka | 3 |
| **P1 Tracking** | **Marketing Source + dual-deal/margin** | 3 | SF · QA | Node, Mongo | 2 |
| | Channel registration + approval | 3 | MF · SF · QA | Node | 1 |
| | Tracker link + short-link generation | 3 | MF · SF · QA | Node, Rebrandly API | 1 |
| | Marketplace + approval → auto-create marketing source | 4 | MF · SF · QA | Node | 2 |
| | Status cascade (data-layer enforced) | 3 | SF · QA | Node | 1 |
| | Stats queries + reporting endpoints | 5 | SF · QA | Go, CH | 2 |
| | Reporting & dashboard screens | 11 | JF · SF · QA | React | 3 |
| **P2 Financial + Integration** | Commission engine (CPA cap / RS / Hybrid / dual) | 7 | SF · MF · QA | Node worker | 3 |
| | Account entity + encrypted credentials | 6 | MF · SF · QA | Node, KMS | 1 |
| | **ETL adapter framework + 1st adapter** | 6 | SF · QA | Go, Mongo | 4 |
| | Payment service + PSP integration | 10 | MF · SF · QA | Node, PSP SDK | 2 |
| | Operator invoicing (Draft→Sent→Acknowledged→Paid) | 9 | MF · SF · QA | Node | 2 |
| | Affiliate payouts + statements | 9 | MF · SF · QA | Node | 2 |
| | Multi-currency + historical FX | 9 | JF · SF · QA | Node | 1 |
| | CSV/PDF export | 11 | JF · SF · QA | React | 1 |
| **P3 Reconciliation + Hardening** | **Reconciliation (three-layer, snapshots, gap detection)** | 8 | SF · QA | Go, CH | 4 |
| | Reconciliation review UI (player-level) | 11 | JF · SF · QA | React | 2 |
| | Impersonation + audit log | 2 | MF · SF · QA | Node | 1 |
| | Bulk operations + partial-failure handling | various | JF · SF · QA | React + Node | 1 |
| | Sub-affiliate commission cascade | 7 | MF · SF · QA | Node | 1 |
| | Affiliate portal | 12 | JF · SF · QA | React | 3 |
| | Security hardening, QA, UAT, bug-fix | all | QA · SF · MF · JF | — | 3 |

---

## 5. Timeline

| | Month 1 | Month 2 | Month 3 | Month 4 |
|---|---------|---------|---------|---------|
| **SF** | Infra, gateway, Go ingestion (stream + postback) | Marketing source + dual-deal, cascade, stats | Commission engine, **ETL adapter** | **Reconciliation**, hardening |
| **MF** | Auth/RBAC, operator/brand, invite | Channel, tracker link, marketplace | Account, payment, invoicing, payouts | Impersonation, sub-affiliate, QA |
| **JF** | Web app shell + design system | Reporting/dashboard screens | FX, CSV/PDF export | Reconciliation UI, bulk, affiliate portal |
| **QA** _(part-time)_ | Test plan setup | Tracking + commission test cycles | Financial flows + payment testing | Reconciliation, regression, UAT _(full-time)_ |

> **Note — schedule contingency.** The 4-month plan reflects focused development effort.
> Allow an additional **4–6 weeks** for UAT feedback cycles, third-party integration
> iterations, production stabilization, and post-launch maintenance/hardening. A realistic
> end-to-end delivery window is therefore **~5–5.5 months**.

---

## 6. Milestones & Deliverables

| Milestone | Timing | Deliverable |
|-----------|--------|-------------|
| **M1 — Core platform** | End of Month 2 | Operator/brand/affiliate management, marketing-source tracking, commission engine, reporting dashboards. Demo-ready. |
| **M2 — Operational platform** | End of Month 3 | Operator invoicing, affiliate payouts, payment integration, first back-office ETL adapter. One operator can run live. |
| **M3 — Full platform** | End of Month 4 | Data reconciliation, affiliate portal, impersonation, bulk operations, security hardening. Production-ready. |

---

## 7. Assumptions & Client Responsibilities

The following are required from the client and are **prerequisites** for the dependent
modules. Delays in providing them shift only the affected modules (ETL adapter,
reconciliation); the rest of the schedule is unaffected.

- **Hosting infrastructure for two environments (Staging + Production)**, domain, SSL, and CDN/DNS (e.g. Cloudflare) are procured, owned, and paid for by the client (servers, DNS, certificates, Cloudflare plan, WAF/CDN). **Server setup, configuration, orchestration, and deployment are performed by us** on the client-provided infrastructure — the client grants the necessary access.
- **All third-party service costs** (hosting, Cloudflare, URL-shortener, payment provider, email/SMS, and any operator-platform API fees) are borne by the client.
- **Operator API access & sandbox** for each back-office platform to be integrated, including documentation and test credentials.
- **Representative test data** from the operator, required to validate the reconciliation module.
- **Chosen payment provider (PSP)** confirmed before Month 3.
- **First back-office platform** for the initial ETL adapter confirmed before Month 3 (e.g. Softswiss, EveryMatrix, Digitain).
- Each additional back-office platform is a separate adapter, scoped and quoted individually.

---

## 8. Engagement & Pricing

The platform is delivered on a **monthly development fee** basis for a dedicated team
(1 senior/tech lead + 1 mid-level full-stack + 1 frontend + 1 part-time QA/tester). Billing
is monthly for the duration of the engagement.

| Item | Basis | Duration |
|------|-------|----------|
| **Environment setup** — Staging + Production provisioning, orchestration, CI/CD pipelines (performed by the tech lead) | Monthly dev fee | ~2–3 weeks |
| **Core platform development** — foundation, tracking & marketing source, commission engine, billing & invoicing, payment, reporting, affiliate portal | Monthly dev fee | ~4 months |
| Stabilization, UAT, security hardening | Included in the monthly fee | +4–6 weeks |
| **Reconciliation module** | Extends the engagement | +~1 month (begins once operator test data is available) |
| **ETL adapter — per back-office platform** | Extends the engagement | +~2–3 weeks per platform |
| **Ongoing maintenance & support** | Monthly retainer | After go-live, as needed |

**Monthly fee:** **$12,500 / month** per development team.

> The core build is a continuous monthly engagement (~4 months, ~5–5.5 with stabilization).
> Modules that depend on operator/third-party readiness — reconciliation and each ETL
> adapter — are not fixed-scope; they extend the engagement by additional month(s) and then
> transition into ongoing maintenance. Each additional back-office platform added later is a
> further adapter and additional development time.
