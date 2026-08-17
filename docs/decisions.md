# Falancé Architecture Decisions

## ADR-001 — Google Sheets as Initial Storage

Status: Accepted

Google Sheets is used as the initial storage layer.

Reason:
- easy to inspect
- easy for family administrators
- easy to prototype
- works well with Gemini/Canvas
- low initial infrastructure complexity

The application must use a repository abstraction so storage can later migrate to Supabase.

---

## ADR-002 — Supabase as Future Storage

Status: Accepted

Supabase is the planned production-scale storage option.

Reason:
- relational database
- authentication possibilities
- Row Level Security
- scalable backend architecture

Migration is not part of the initial MVP.

---

## ADR-003 — Telegram as Primary Interface

Status: Accepted

Telegram is the primary user interface.

Reason:
- family members can interact through chat
- natural-language transaction entry
- receipt submission
- notifications
- Mini App support

---

## ADR-004 — Telegram Mini App for Dashboard

Status: Accepted

The Mini App will provide the production dashboard.

Gemini Canvas is used as a prototyping/analytics tool, not as the production frontend.

---

## ADR-005 — AI Provider Agnostic

Status: Accepted

Falancé must not be tightly coupled to one AI provider.

Potential providers can include OpenRouter, Cerebras, Gemini, and other compatible APIs.

Provider/model selection should be configuration-driven where practical.

---

## ADR-006 — Family Isolation

Status: Accepted

Every family-owned record is scoped by family_id.

No user may access another family's data.

Authorization is enforced server-side.

---

## ADR-007 — One Google Spreadsheet per Family

Status: Accepted

Each family receives a dedicated Google Spreadsheet. A separate central registry maps the
stable application `family_id` to the storage-specific `spreadsheet_id`, along with family,
membership, and invitation metadata.

Reason:
- natural family-level isolation
- simpler storage administration
- avoids a large shared financial spreadsheet
- preserves a stable family identifier for future Supabase migration

Google-specific code is isolated behind the family repository interface. Application
authorization uses the registry membership index before resolving a spreadsheet.

Family spreadsheets are provisioned with Google Drive `files.create` inside a dedicated
Falancé Drive folder, then initialized through the Sheets API. This avoids relying on the
service account's default Drive storage while preserving one-family-one-spreadsheet.

---

## ADR-008 — Subscription-ready, No Billing in MVP

Status: Accepted

Families store a non-enforcing `plan` value so future entitlements can be introduced without
changing the family model. Billing, payment providers, invoices, and paywalls are explicitly
out of scope for the MVP. All current families have access to implemented functionality.
