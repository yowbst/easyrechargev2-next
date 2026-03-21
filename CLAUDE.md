# CLAUDE.md

## Project Overview

easyRecharge Next.js migration. Swiss EV charging station installation marketplace.
Migrating from React SPA + Express (on Replit) to Next.js App Router (on Vercel).

## Migration plan

The full migration spec is at: docs/superpowers/specs/2026-03-18-nextjs-migration-design.md

## Commands

npm run dev          # Dev server on port 3000
npm run build        # Production build
npm run start        # Run production build
npm run lint         # ESLint

## Architecture

Next.js App Router. Directus CMS as single source of truth for content, routing, i18n, and form storage.
No database — all persistence is via Directus REST API.
Form telemetry via PostHog client-side custom events.

## Tech Stack

- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS, shadcn/ui (new-york style), Radix UI
- Directus (CMS + form storage), Resend (email)
- PostHog analytics, Vercel deployment

## Environment Variables

See .env.local (not committed). Required: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN

## Design System

Swiss-inspired. Primary Electric Blue (200 90% 50%) used sparingly.
Fonts: Montserrat/Open Sans, JetBrains Mono for specs.
Dark mode supported. WCAG 2.1 AA compliance.
