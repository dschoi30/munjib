# Honen Design System Implementation Guide

## Context and goals

Honen is a content-first reading surface for readers and knowledge seekers. The design intent is to make content scannable and trustworthy with token-driven foundations, consistent component states, and WCAG 2.2 AA-ready interaction rules.

## Design tokens and foundations

### Token layers

- Primitive tokens define source values for font, color, spacing, radius, shadow, and motion.
- Semantic tokens must be used by component guidance and implementation instead of raw hex values or one-off spacing.
- Component tokens should wrap repeated component decisions such as control height, card radius, and focus-visible styling.

### Typography

- Body copy must use `font.family.primary` through `--font-family-primary`.
- Default body text must use `font.size.base`, `font.weight.base`, and `font.lineHeight.base`.
- Components must not introduce local typography exceptions unless a new semantic token is added.

### Color

- Text must use semantic text tokens such as `--color-text-body`, `--color-text-muted`, or `--color-text-inverse`.
- Surfaces must use semantic surface tokens such as `--color-surface-page`, `--color-surface-card`, or `--color-surface-inverse`.
- Reader and editor shells should follow the uploaded Honen reference palette: warm page background `--color-surface-page`, slightly lifted editor background `--color-surface-editor`, white control surface `--color-surface-control`, and soft warm borders.
- Primary actions must use the Honen green brand tokens (`--color-brand-primary`, hover, active, foreground) instead of the inverse surface token.
- Selected or active low-emphasis controls should use the pale green brand-muted tokens rather than a generic gray fill.
- Borders must use semantic border tokens.
- Focus indicators must use `--color-focus-visible`.

### Spacing, radius, shadow, and motion

- Layout and component spacing must use the Honen spacing scale or a documented component token.
- Interactive controls must use `--radius-interactive`.
- Cards must use `--radius-card` and the shared card shadow token when elevation is needed.
- Motion must use the duration tokens and must respect reduced-motion preferences.

## Component-level rules

### Buttons

#### Anatomy

- Button container
- Text label or icon
- Optional leading/trailing icon
- Optional loading indicator

#### Variants

- Primary: main action on a surface.
- Secondary: supporting action.
- Ghost: low-emphasis contextual action.
- Destructive: irreversible or high-risk action.

#### States

- Default must show the action priority clearly.
- Hover must provide pointer feedback without being the only discoverability mechanism.
- Focus-visible must show a visible outline using the focus token.
- Active must provide pressed feedback.
- Disabled must prevent activation and preserve enough context to understand why the action is unavailable.
- Loading must expose `aria-busy` when the pending state is user-relevant and must prevent duplicate submissions when needed.
- Error must be paired with adjacent human-readable recovery copy.

#### Interaction

- Keyboard users must activate buttons with `Enter` and `Space`.
- Pointer users should receive hover and active feedback.
- Touch users must receive a target large enough to activate reliably.
- Icon-only buttons must have an accessible name.

### Links

#### Anatomy

- Link text
- Optional inline icon
- Optional external-link indicator
- Optional status text for unavailable or failed destinations

#### States

- Default must be visually identifiable as navigation or a text action.
- Hover must add affordance without being the only indication that the text is interactive.
- Focus-visible must use the shared focus token and must remain visible when the link wraps.
- Active must provide pressed or visited-route feedback where the platform supports it.
- Disabled must usually render as non-interactive text with a reason nearby instead of a fake disabled anchor.
- Loading must reserve space for pending navigation feedback when the transition is user-visible.
- Error must identify the unavailable destination and provide a recovery action when one exists.

#### Responsive and overflow behavior

- Link text must describe the destination or action.
- Links must not rely on color alone to communicate interactivity.
- Long links must wrap without breaking the layout.
- External links should identify that the destination leaves the current site when context is not obvious.

### Cards

#### Anatomy

- Container
- Optional media or icon region
- Eyebrow or metadata
- Title
- Summary
- Optional footer actions
- Optional status, loading, or error region

#### States

- Default must use semantic surface, border, radius, and optional elevation tokens.
- Hover must communicate interactivity only when the card or a contained action is clickable.
- Focus-visible must show the shared focus token on the interactive card or first contained action.
- Active must provide pressed feedback without shifting surrounding layout.
- Disabled must reduce emphasis while keeping title and reason text readable.
- Loading must reserve the final layout with skeleton or placeholder regions.
- Error must keep the card boundary visible and provide recoverable copy or retry affordance.

#### Responsive and overflow behavior

- Cards must use semantic surface, border, radius, and shadow tokens.
- Card titles must wrap and preserve hierarchy.
- Long summaries should clamp only when the full content remains reachable.
- Empty media slots must not cause layout collapse.

### Navigation

#### Anatomy

- Navigation landmark or labelled group
- Navigation list
- Current item indicator
- Optional collapse or overflow control
- Optional mobile disclosure panel

#### States

- Default must expose stable labels and hierarchy.
- Hover must provide pointer feedback on interactive items.
- Focus-visible must keep the active focus target visible inside collapsed, scrolled, or overflow containers.
- Active/current must identify the current item visually and programmatically.
- Disabled must be avoided for navigation destinations; unavailable destinations must explain why they cannot be opened.
- Loading must preserve the navigation shell and use skeleton rows or progress text for pending content.
- Error must keep global navigation usable and show a scoped recovery path.

#### Responsive and overflow behavior

- Navigation must identify the current item visually and programmatically.
- Collapsed and mobile navigation must preserve keyboard access.
- Open and close controls must expose state with accessible labels or attributes.
- Navigation labels must be concise and descriptive.

### Lists

#### Anatomy

- Semantic list container
- List item
- Optional leading visual
- Primary label
- Optional secondary metadata
- Optional row action or status region

#### States

- Default must support quick scanning with tokenized spacing and typography.
- Hover must only appear on interactive rows and must not hide required information.
- Focus-visible must outline the focused row or contained control.
- Active/selected must be distinguishable from hover and must not rely on color alone.
- Disabled must preserve item text and explain why the item is unavailable when relevant.
- Loading must reserve item density with skeleton rows.
- Error must identify the affected row or list scope and provide retry or fallback copy.

#### Responsive and overflow behavior

- Lists must use semantic list markup when the content is a list.
- List item spacing must use tokens.
- Empty lists must explain what is missing and what the user can do next.
- Long items must wrap or truncate according to a documented rule.

## Accessibility requirements and acceptance criteria

- Interactive elements must be reachable with `Tab`.
- Focus-visible styles must be visible at normal and zoomed viewport sizes.
- Text and controls must meet WCAG 2.2 AA contrast requirements.
- Color must not be the only state indicator.
- Loading states must not trap focus or cause repeated submissions.
- Error states must include recoverable instructions.
- Screen reader names, roles, and states must match the visual behavior.
- Touch targets should remain reliably tappable on narrow screens.

## Content and tone standards

Use concise, confident, implementation-focused language.

| Use | Avoid |
| --- | --- |
| `Save changes` | `Submit` |
| `Try again` | `Oops` |
| `Open article` | `Click here` |
| `No articles yet.` | `Nothing to show!!!` |
| `We couldn't load this content. Try again.` | `Something went wrong` |

## Anti-patterns and prohibited implementations

- Do not use raw hex values in component guidance.
- Do not add one-off spacing or typography exceptions.
- Do not hide focus indicators.
- Do not use low-contrast text.
- Do not reveal required controls only on hover.
- Do not ship a component without default, hover, focus-visible, active, disabled, loading, and error guidance.
- Do not use ambiguous labels like `Click here`, `More`, or `Submit` when a specific label is available.

## QA checklist

- [ ] Tokens are registered and semantic aliases are available.
- [ ] Components use semantic tokens instead of raw values.
- [ ] Buttons, links, cards, navigation, and lists document all required states.
- [ ] Keyboard, pointer, and touch behaviors are documented and verified.
- [ ] Long content, overflow, loading, empty, and error states are handled.
- [ ] WCAG 2.2 AA contrast is verified for text and controls.
- [ ] Focus-visible styling is visible and consistent.
- [ ] Reduced-motion preferences are respected.
