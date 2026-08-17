# Falancé Architecture

## Overview

Falancé is a family finance assistant primarily accessed through Telegram.

It has two user-facing interfaces:

1. Telegram Bot
2. Telegram Mini App

## High-Level Architecture

Telegram Bot
       │
       ▼
Next.js Backend
       │
       ├── Authorization
       ├── Finance Services
       ├── AI Services
       └── Repository
              │
              ▼
       Google Sheets

Telegram Mini App
       │
       ▼
Next.js Backend

## Storage Strategy

Version 0.1:
Google Sheets and Google Drive. Falancé has one Google Spreadsheet per family.

A central Falancé registry spreadsheet stores application metadata: family records,
membership index, invitations, and pending family-creation requests. The registry maps
the stable `family_id` to the storage-only `spreadsheet_id`; it is not a family finance
spreadsheet. Authorization resolves `Telegram user ID → membership → family_id →
spreadsheet_id` server-side. Client-supplied family or spreadsheet IDs are never trusted.

The application layer depends on family repository interfaces. Google Sheets is an
infrastructure implementation, so it can later be replaced by Supabase without changing
Telegram command, authorization, or family business logic.

Future:
Supabase

Business logic must not depend directly on Google Sheets.

## Family Spreadsheet

Each provisioned family spreadsheet contains `Settings`, `Members`, `Transactions`,
`Categories`, `Monthly Summary`, and `AI Insights`. Only the initial schemas are created
in Milestone 2; transaction and reporting behavior are deferred.

## Access and Subscription Readiness

The backend service account owns application storage access. Direct Google Spreadsheet
sharing to OWNER and ADMIN is **not automated yet**, because Telegram identity does not
provide a verified Google email. It is deferred until a verified Google-email collection
flow exists; MEMBER must never receive direct spreadsheet access. Application-level
authorization is implemented now and remains the source of truth.

Families carry a `plan` field for future entitlements, but no billing is implemented.

## AI Strategy

AI is a replaceable service.

Potential providers:
- OpenRouter
- Cerebras
- Gemini
- Other OpenAI-compatible providers

The application should not require a specific provider.

## Gemini Canvas

Gemini Canvas in Google Sheets is used primarily for:
- dashboard prototyping
- data exploration
- analytics experiments

The production Telegram Mini App remains a Next.js application controlled by Falancé.
