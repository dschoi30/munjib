---
id: honen-design-system
title: Honen Design System
type: concept
status: active
summary: Honen content-site design system foundation, semantic token contract, component state rules, and accessibility acceptance criteria.
created: 2026-07-04
updated: 2026-07-04
source_count: 2
tags:
  - design-system
  - honen
  - accessibility
links:
  - "[[Wiki Index]]"
  - "[[Local Development Workflow]]"
---

# Honen Design System

## Intent

Honen design system work makes the content site consistent, token-driven, accessible, and fast to implement. The product surface is content-first and aimed at readers and knowledge seekers, so the design system prioritizes readable structure, predictable interaction states, and reusable component guidance.

## Source evidence

- User-provided `design.md` brief in the 2026-07-04 task conversation.
- Implementation source: `docs/design-system/honen.md`, `lib/design-system/tokens.ts`, `app/globals.css`, `tailwind.config.ts`, and shared UI primitives under `components/ui/`.

## Token contract

Foundation tokens cover Inter typography, Honen text/surface/border/focus colors, compact spacing, radius, shadow, and motion duration scales. Component implementation must use semantic CSS variables such as `--color-text-body`, `--color-surface-card`, `--color-border-default`, `--color-focus-visible`, `--radius-interactive`, and `--size-control-md` instead of raw values. The typed primitive color tokens mirror the CSS semantic categories, and Tailwind aliases expose the shared surface, border, text, and interactive radius tokens so shared primitives do not need arbitrary CSS variable classes for normal variants.

## Priority component coverage

The first implementation slice targets shared foundations and high-reuse primitives because the brief identified cards, links, buttons, navigation, and lists as the densest page components. The current code slice establishes global tokens, Tailwind semantic aliases, typed token exports, and tokenized `Button`, `Input`, and `Textarea` primitives. Button default heights live in size variants rather than the base class so compact toolbar and icon call sites can override dimensions, and the primary default avoids inherited hover/elevation chrome so legacy custom buttons keep their local states. ARIA-driven loading and invalid states use explicit generated variants. The implementation guide now requires explicit default, hover, focus-visible, active, disabled, loading, and error state guidance for buttons, links, cards, navigation, and lists.

## Accessibility contract

Interactive controls must remain keyboard reachable, show visible focus-visible styling, provide pointer and touch feedback, and expose disabled/loading/error behavior without relying on color alone. Component guidance must define default, hover, focus-visible, active, disabled, loading, and error states before a component is considered ready.

## Open follow-ups

- Audit existing card, link, navigation, and list implementations for raw colors, one-off spacing, hover-only controls, and missing state documentation.
- Add focused component tests for state class coverage when more primitives are migrated.
- Capture visual screenshots once the migrated primitives are exercised in a runnable app route.
