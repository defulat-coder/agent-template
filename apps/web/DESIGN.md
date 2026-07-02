# Agno: Agent Framework and High-Performance Runtime for Multi-Agent Systems

## Overview

**Product:** Agno: Agent Framework and High-Performance Runtime for Multi-Agent Systems
**URL:** https://www.agno.com/
**Surface type:** marketing
**Audience:** Developers and technical decision-makers
**Brand character:** Conversion-focused marketing presence with a rich, diverse color palette and 4 typefaces.

### Design Principles

- Consistency over novelty — reuse existing patterns before inventing new ones.
- Token-driven — every visual decision references a token, not a magic number.
- Accessible by default — compliance is a baseline, not a feature.

## Colors

| Token | Value | Role |
|-------|-------|------|
| color-7 | `#F0F0F0` | Background |
| color-6 | `#E0E0E0` | Surface |
| color-1 | `#09090B` | Text Primary |
| color-2 | `#646464` | Text Primary |
| color-3 | `#FF4017` | Accent |
| color-4 | `#BBBBBB` | Border |
| color-5 | `#D9D9D9` | Border |
| color-8 | `#FFFFFF` | Text Light |

## Typography

**Font stack:** Inter Display, Geist Mono, Inter, sans-serif

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 12px | Captions, metadata |
| text-sm | 14px | Labels, secondary text |
| text-base | 16px | Body text (default) |
| text-lg | 18px | Subheadings, emphasis |
| text-xl | 30px | Section headings |
| text-2xl | 40px | Section headings |
| text-3xl | 58px | Section headings |

**Weight scale:** 400 · 500 · 600
**Line heights:** 63.36px · 30px · 40px · 27px · 21px · 24px · 16px · 16.8px

## Spacing

**Base unit:** 4px

`space-1: 2px` · `space-2: 3px` · `space-3: 4px` · `space-4: 6px` · `space-5: 8px` · `space-6: 9px` · `space-7: 12px` · `space-8: 13px` · `space-9: 14px` · `space-10: 16px` · `space-11: 24px` · `space-12: 31px` · `space-13: 32px` · `space-14: 70px` · `space-15: 81px` · `space-16: 112px` · `space-17: 230px`

## Shapes

**Border radius:** `radius-sm: 8px` · `radius-md: 360px`

## Elevation

_None detected._

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-base:** `background-color 0.3s`
- **duration-slow:** `all, opacity 0.5s`

## Components

- **Buttons:** 5 detected
- **Links:** 84 detected
- **Inputs:** 1 detected
- **Navigation:** 3 elements
- **Forms:** 1 detected
- **Images:** 207 detected

## Do's and Don'ts

### Do

- Reference tokens by name, not raw values — agents and developers should use `color.text.primary`, not `#171717`.
- Define all interactive states: default, hover, focus-visible, active, disabled.
- Use the spacing scale for all padding, margin, and gap values.
- Write content in sentence case. Reserve ALL CAPS for acronyms only.
- Test every component at the smallest and largest breakpoint before shipping.

### Don't

- Do not introduce colors outside the extracted palette.
- Do not use arbitrary spacing values — stick to the scale.
- Do not mix border-radius values. Pin to the detected set (8px, 360px).
- Do not use full-uppercase text for body or paragraph content.
- Do not nest interactive elements (e.g. buttons inside links).
- Do not ship components without defining hover, focus-visible, and disabled states.

## Writing Tone

Concise, confident, implementation-focused. Avoid filler preambles.

## Authoring Workflow

When creating or updating a component guideline for this system, follow this sequence:

1. **State the intent** — one sentence on what the component does and why it exists.
2. **Map tokens** — list every color, spacing, typography, and radius token the component uses. No raw values.
3. **Define anatomy** — break the component into named parts (container, label, icon, etc.) with their token assignments.
4. **Specify states** — document every state: default, hover, focus-visible, active, disabled, loading, error, empty.
5. **Describe interactions** — keyboard, pointer, and touch behavior, including edge cases (long content, overflow, truncation).
6. **Add accessibility criteria** — write testable pass/fail checks (e.g. "focus ring must be visible at 3:1 contrast").
7. **List anti-patterns** — concrete examples of misuse with a brief explanation of why each is wrong.
8. **Close with a QA checklist** — a mechanical list of verifiable items (see Definition of Done below).

## Required Output Structure

Every component guideline produced from this system must contain these sections, in order:

1. Overview — purpose, when to use, when not to use.
2. Tokens and foundations — all referenced tokens from the tables above.
3. Anatomy and variants — named parts, variant matrix, responsive behavior.
4. States and interactions — full state table, keyboard/pointer/touch behavior.
5. Accessibility — ARIA attributes, contrast requirements, focus management, screen reader behavior.
6. Content guidelines — copy length, tone, capitalisation, placeholder text rules.
7. Anti-patterns — explicit examples of what not to build, with reasoning.

## Component Requirements

Every component built against this system must:

- Reference only tokens defined in the tables above — no hardcoded hex, px, or font values.
- Define all interactive states: default, hover, focus-visible, active, disabled, loading, error.
- Specify responsive behavior at the smallest and largest supported breakpoint.
- Handle edge cases: empty state, overflow / truncation, maximum content length.
- Include keyboard navigation (Tab, Enter, Escape, Arrow keys where applicable).
- Document ARIA roles, labels, and live-region behavior where relevant.
- Include known page component density: - **Buttons:** 5 detected
- **Links:** 84 detected
- **Inputs:** 1 detected
- **Navigation:** 3 elements
- **Forms:** 1 detected
- **Images:** 207 detected

## Definition of Done

A component is not complete until every item below is checked:

- Renders correctly in its default state (smoke test).
- All states documented and visually verified (hover, focus, disabled, loading, error, empty).
- All visual values use design tokens — zero hardcoded values.
- Keyboard navigation works without a pointer.
- No critical accessibility violations (contrast, ARIA, focus order).
- Tested at smallest and largest breakpoint.
- Anti-patterns section lists at least one concrete misuse example.
- Documentation covers purpose, usage, props/API, and limitations.
