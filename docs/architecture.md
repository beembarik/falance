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
Google Sheets

Future:
Supabase

Business logic must not depend directly on Google Sheets.

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