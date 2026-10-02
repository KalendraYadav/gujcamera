
# UI_DESIGN_RULEBOOK.md

Universal UI/UX laws for AI coding agents. Binding. Project-specific facts (brand, palette, routes, personas, pages) live in `design.md`. Implementation lives in the codebase.

---

## 0. How to use this document

### 0.1 Precedence

1. Accessibility and usability rules in this file (Sections 2, 13) are never overridden.
2. `design.md` overrides every other rule in this file about **brand, palette, typeface, tone, page inventory, and component inventory**.
3. Existing codebase tokens and components override the defaults in this file (Section 22).
4. Everything else in this file applies as written.
5. If `design.md` contradicts an accessibility or usability rule, follow this file and report the conflict in the final message. Do not silently comply.

### 0.2 Keywords

- **MUST / MUST NOT**: mandatory. A violation is a defect.
- **SHOULD / SHOULD NOT**: default. Deviating requires a one-line reason in the PR/final message.
- **MAY**: allowed, not required.

### 0.3 Rule IDs

Rules have IDs (for example `SP-03`). When you deviate from or apply a non-obvious rule, cite the ID in your summary.

### 0.4 Missing information

- If `design.md` is missing or silent on brand, palette, or typeface: **do not invent them silently**. Propose a compact token set (Section 18.2) and state it before building. If the user cannot be asked, use the neutral defaults in this file and flag them as provisional.
- If a value you need is not defined in this file, `design.md`, or the codebase: choose the nearest token on the existing scale. Never create an off-scale value.

---

## 1. Design philosophy

### 1.1 Definition of "professional, mature, premium"

An interface is professional when a first-time user can identify the purpose of the screen, the primary action, and their current location within 5 seconds, and nothing on screen contradicts what they concluded.

| Quality | Measurable meaning |
|---|---|
| Restrained | ≤ 1 accent hue in use per screen (plus semantic colors when meaningful). ≤ 1 primary button per view/section. |
| Consistent | Every value (space, size, color, radius, duration) comes from a token. Zero one-off values. |
| Legible | Body text ≥ 14px, contrast ≥ 4.5:1, line length ≤ 75 characters. |
| Calm | Whitespace separates groups. Borders and backgrounds are used only when spacing cannot do the job. |
| Predictable | Same component, same look, same behavior, everywhere. |
| Fast-feeling | Every action produces visible feedback within 100ms. Waits > 400ms show loading UI. |
| Honest | Data, copy, and states are real. No decoration that implies function it does not have. |

### 1.2 Principles (apply in this order when unsure)

1. **Function first.** Every element MUST answer: "What does the user do or understand because of this?" If there is no answer, delete it.
2. **Hierarchy before style.** Solve layout and hierarchy in grayscale before applying color or polish.
3. **Constrain, then repeat.** Use a small fixed set of tokens. Repetition is the source of professionalism.
4. **Subtract before adding.** When a design feels wrong, remove or de-emphasize before adding anything.
5. **Systems over screens.** Build or reuse a component; never style a one-off screen element.
6. **Content drives layout.** Layout is designed around real content, including worst-case content (Section 10.3).

### 1.3 Visual qualities to avoid (prohibited unless `design.md` explicitly requires them)

- Gradients used as decoration (backgrounds, text, borders, buttons)
- Glow effects, neon shadows, colored drop shadows
- Glassmorphism (backdrop blur + translucent panels) as a general surface style
- Purple/indigo-to-blue palettes as a default brand look
- Decorative blobs, grids, orbs, floating shapes, particle effects
- More than one accent hue
- Emoji as icons or bullets in product UI
- Shadows on every element
- Rounded-2xl-on-everything card layouts
- Motion that runs without a user action (Section 12)

---

## 2. UX principles

### 2.1 User goals

- **UX-01** Before designing any screen, state in one sentence: *"[User type] uses this screen to [task] so that [outcome]."* All layout decisions MUST serve that sentence.
- **UX-02** Identify exactly one **primary action** per screen (or per distinct section/modal). It gets the only filled primary-color button in that scope.
- **UX-03** Order content by the user's task sequence, not by the database schema or org structure.

### 2.2 Cognitive load

| Rule | Limit |
|---|---|
| **CL-01** Top-level navigation items | ≤ 7 (prefer 5) |
| **CL-02** Choices in a single control group (radio, segmented, tabs) | ≤ 7 |
| **CL-03** Fields visible in a form section before a section break | ≤ 7 |
| **CL-04** Primary/emphasized elements competing on a viewport | 1 dominant, ≤ 2 secondary |
| **CL-05** Distinct font sizes on one screen | ≤ 5 |
| **CL-06** Distinct accent/status colors on one screen | 1 accent + semantic colors only where meaningful |
| **CL-07** Table columns visible by default (desktop) | ≤ 8; the rest via column picker |

Rules for reducing load:
- Group by proximity (Section 5.3) before adding boxes or dividers.
- Show defaults; hide advanced options behind "Advanced" disclosure.
- Prefer recognition over recall: show options, recent items, and current selection; never require remembering a value from a prior screen.

### 2.3 Information hierarchy

See Section 3. Every screen MUST have exactly this reading order: **where am I (page title/nav) → what can I do (primary action) → what is here (content) → what else (secondary)**.

### 2.4 Predictability

- **PR-01** Follow platform and web conventions. Logo top-left links home. Primary nav is left sidebar or top bar. Search is a magnifier icon/field. Close is an X at the top-right of overlays. Primary button is on the right in dialog footers.
- **PR-02** The same action MUST have the same label, icon, position, and style everywhere (Section 9).
- **PR-03** Do not change layout of a page as data loads (no layout shift). Reserve space with skeletons or fixed containers.
- **PR-04** Links navigate; buttons act. Never style a link as a button to perform a mutation, or a button as a link to navigate (a link styled as a button for a primary navigation CTA is allowed).

### 2.5 Affordances

- Interactive elements MUST look interactive: buttons have a fill or border and padding; links are colored and/or underlined; inputs have a visible border or background and a label.
- Non-interactive elements MUST NOT look interactive: no hover effects, pointer cursors, or button-like styling on static content.
- Clickable rows/cards MUST have hover background and `cursor-pointer`, and MUST contain one clear primary link/target for keyboard users.
- Drag handles, resizable edges, and expandable regions MUST show an icon or cursor cue.

### 2.6 Feedback

| Event | Required feedback | Timing |
|---|---|---|
| Click/tap on any control | Pressed/active visual state | Immediate (< 100ms) |
| Async action started | Button shows spinner + disabled, label stays or changes to progressive form ("Saving…") | Immediately |
| Wait > 400ms | Skeleton (content areas) or inline spinner (actions) | ≤ 400ms after start |
| Wait > 10s | Determinate progress or explanation + cancel | — |
| Success | Toast (transient, global actions) or inline confirmation (form-local) | Immediately, auto-dismiss 4–6s |
| Error | Inline near the cause; banner if page-level; toast only when no better place | Immediately, persistent until resolved |
| Destructive action done | Toast with **Undo** for ≥ 8s when reversible | Immediately |

### 2.7 Progressive disclosure

- Show the 20% of options used 80% of the time. Put the rest behind "Advanced", "More", a "⋯" menu, or a details panel.
- Complex flows > 7 fields or > 1 concept MUST be split into steps or sections with a visible progress indicator.
- Never hide the primary action or critical status information behind disclosure.

### 2.8 Error prevention

1. **Constrain input** (select, date picker, stepper, masked input) before validating free text.
2. **Disable only when the reason is obvious**; otherwise leave enabled and explain on submit. If disabled, provide a tooltip/inline reason.
3. **Destructive actions** MUST: use destructive styling, name the object in the confirmation, state the consequence, and be undoable if possible. Irreversible deletion of important data requires typed confirmation.
4. **Preserve user input** on error, navigation, or refresh (draft persistence for long forms).
5. **Warn on unsaved changes** when leaving a dirty form.
6. Never place a destructive button adjacent to (< 16px from) a primary action without visual separation.

### 2.9 Accessibility

See Section 13. Accessibility is a precondition, not a phase.

---

## 3. Visual hierarchy

### 3.1 Tiers

Every element on a screen MUST be assigned exactly one tier before styling.

| Tier | Purpose | How to style it (use only these levers) |
|---|---|---|
| **T1 Primary** | The one thing to do/read first | Largest size in its group OR strongest color/fill; weight 600; text color `text` |
| **T2 Secondary** | Supports T1 | Medium size; weight 500 or 400; `text` or `text-muted` |
| **T3 Tertiary** | Metadata, hints, timestamps | Smallest size (12–13px); weight 400; `text-muted` or `text-subtle` |

Hierarchy levers, in priority order: **(1) size, (2) weight, (3) color/contrast, (4) position/whitespace**. Do not stack more than two levers on one element (e.g., not large + bold + colored + uppercase).

### 3.2 Emphasis rules

- **HI-01** Emphasize by **de-emphasizing the surroundings** first (lighter secondary text, fewer borders) before making the primary element louder.
- **HI-02** Only one element per section MAY use the primary fill color.
- **HI-03** Bold (600+) is for headings, key values, and active states. Never bold body paragraphs or entire table rows.
- **HI-04** Color emphasis on text is reserved for links and semantic status. Never color text purely for decoration.
- **HI-05** Use size contrast of ≥ 1.25× between adjacent hierarchy levels. If two levels look similar, one is redundant.

### 3.3 Element roles

| Element | Style |
|---|---|
| Page title | T1 of the page: `text-2xl` (24px) / 600, or `text-3xl` (30px) for marketing/landing. One per page (`h1`). |
| Section heading | `text-lg`/`text-xl` (18–20px) / 600 |
| Card/panel title | `text-base` (16px) / 600, or `text-sm` (14px) / 600 in dense UI |
| Body | `text-sm` (14px) in app UI; `text-base` (16px) in reading/marketing. Weight 400, color `text` (or `text-muted` for supporting) |
| Label (form/field) | `text-sm` (14px) / 500, color `text` |
| Metadata (timestamps, IDs, helper text) | `text-xs` (12px) or 13px / 400, color `text-muted` |
| CTA (primary) | Filled primary button, weight 500–600, sentence case |
| CTA (secondary) | Outline or subtle-fill button |
| CTA (tertiary) | Ghost button or link |
| Key numeric value (KPI) | `text-2xl`–`text-3xl` / 600, `tabular-nums` |

### 3.4 Density

Choose one density per surface and apply it uniformly.

| Density | Row/control height | Use |
|---|---|---|
| Compact | 32px | Admin tables, dev tools, power users |
| Default | 40px | Standard SaaS, forms |
| Comfortable | 48px | Consumer, touch-first, marketing |

- **DN-01** Mixed densities inside one view are prohibited.
- **DN-02** Density changes spacing and control height, not font size below 12px.

---

## 4. Layout and grid

### 4.1 Containers

| Token | Max width | Use |
|---|---|---|
| `container-narrow` | 640px | Auth, single-column forms, onboarding, reading |
| `container-content` | 768px | Long-form content, settings forms |
| `container-default` | 1024px | Focused app pages |
| `container-wide` | 1280px | Dashboards, tables, marketing sections |
| `container-full` | 100% | Full-bleed app shells (sidebar layouts) |

- **LY-01** Content MUST be centered in a max-width container with horizontal page padding: 16px (mobile), 24px (tablet), 32px (desktop).
- **LY-02** Text blocks MUST NOT exceed 75 characters per line (`max-w-prose` = 65ch, or a `measure` token = 75ch).
- **LY-03** Forms MUST NOT stretch beyond 640px wide on desktop; fields do not span full width of a 1280px container.

### 4.2 Grid

- 12-column grid at ≥ 1024px; 8-column at 768–1023px; 4-column below 768px. Gutter: 16px (mobile), 24px (tablet+).
- In code, use CSS Grid/Flex with `gap`. Do not build with margins between siblings.
- Column spans MUST divide cleanly: 12 → 6/6, 4/4/4, 3/3/3/3, 8/4, 9/3. Avoid 5/7 or 7/5 unless justified.
- Card grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (or 4 for compact items). Use `repeat(auto-fill, minmax(280px, 1fr))` for variable counts.

### 4.3 Alignment

- **AL-01** Every element aligns to a shared edge: left edges align vertically down a page; baselines align across a row.
- **AL-02** Text is **left-aligned** by default (LTR). Center alignment only for: short (≤ 2 line) hero/empty-state text, auth headers, and modal icons. Never center multi-line body text or forms.
- **AL-03** Numbers in columns are right-aligned. Text in columns is left-aligned. Column headers match their column's alignment.
- **AL-04** Do not mix left and center alignment within one block.
- **AL-05** Icon + text pairs: vertically center the icon to the first line of text (for single-line) or align to the first-line cap height (for multi-line).

### 4.4 Section rhythm

| Context | Vertical gap between sections |
|---|---|
| App page: between major sections | 32px (`space-8`) |
| App page: between section heading and its content | 12–16px |
| Marketing: between major sections | 96px desktop / 64px mobile |
| Marketing: between section heading block and content | 48px |
| Within a card/panel: between groups | 24px |
| Within a group: between items | 8–12px |

Rule: **gap between groups > gap within groups**, by at least 2 scale steps.

### 4.5 App shell

- Sidebar layout: sidebar 240px expanded / 64px collapsed; top bar 56–64px; content scrolls independently; sidebar and top bar are fixed.
- Content area: padding 24px (32px at ≥ 1280px); page header (title + description + primary action) at the top; content below.
- Page header: title left, primary action right, optional description below the title (`text-sm text-muted`, max 75ch).

### 4.6 Responsive behavior (summary, detail in Section 11)

Mobile-first. Layout MUST be verified at 375, 768, 1024, 1440px.

---

## 5. Spacing system

### 5.1 Scale (base unit 4px)

Use **only** these values. Anything else is a defect.

| Token | px | Tailwind | Use |
|---|---|---|---|
| `space-0.5` | 2 | `0.5` | Hairline adjustments (icon nudges only) |
| `space-1` | 4 | `1` | Icon-to-text in tight badges; inline gaps |
| `space-2` | 8 | `2` | Gap between related inline items; label-to-input (with `space-1.5`=6 allowed only for label→input) |
| `space-3` | 12 | `3` | Gap between form fields' related elements; compact padding |
| `space-4` | 16 | `4` | Default padding (inputs, small cards); gap between list items; mobile page padding |
| `space-6` | 24 | `6` | Card/panel padding; gap between groups; tablet page padding |
| `space-8` | 32 | `8` | Gap between sections; desktop page padding |
| `space-12` | 48 | `12` | Large section gaps; marketing headings |
| `space-16` | 64 | `16` | Marketing section gaps (mobile) |
| `space-24` | 96 | `24` | Marketing section gaps (desktop) |
| `space-32` | 128 | `32` | Hero vertical padding (desktop only) |

Prohibited values: `space-5` (20), `space-7` (28), `space-9`, `space-10`, `space-11`, and any arbitrary value (`p-[13px]`). Exception: `space-1.5` (6px) label→input only.

### 5.2 Usage rules

| Situation | Spacing |
|---|---|
| Button horizontal padding | 12px (sm), 16px (md), 24px (lg) |
| Input padding | 12px horizontal; height from control-size token |
| Card padding | 16px (compact), 24px (default) |
| Modal padding | 24px |
| Between label and input | 6px (`space-1.5`) or 8px |
| Between form fields | 16–24px |
| Between form sections | 32px |
| Between list items (non-table) | 8–12px |
| Between heading and paragraph | 8px (h3–h4), 12–16px (h1–h2) |
| Between paragraphs | 16px (`space-4`) or 1em |
| Table cell padding | 12px vertical/16px horizontal (default density) |
| Toolbar item gap | 8px |
| Icon-to-text gap | 8px (16–20px icons), 6px (14px icons) |

### 5.3 Proximity law

1. Elements that belong together are closer to each other than to anything else.
2. **Inner gap < outer gap**, by ≥ 2 scale steps. Example: card contents gap 12px, gap between cards 24px.
3. Prefer spacing over dividers to separate groups. Use a divider only when groups are dense, repeated, or need a structural boundary.

### 5.4 Padding vs. margin vs. gap

- Use `gap` in flex/grid for spacing between siblings. Use `padding` for spacing inside containers.
- Avoid margin except for: `mx-auto` centering, and heading-to-text spacing inside prose.
- MUST NOT use negative margins except to compensate for a documented optical alignment (comment required).
- First/last child MUST NOT carry outer margin that breaks container padding.

### 5.5 Padding proportions

- Vertical padding inside a button/input ≈ 0.5× horizontal padding (e.g., 8px / 16px is fine; 6px / 12px for sm).
- Container padding ≥ inner content gap × 1.5.

---

## 6. Typography system

### 6.1 Font selection

- **TY-01** Use exactly one family for UI (sans-serif, e.g., Inter, Geist, system UI stack). A second family (serif or display) MAY be added only when `design.md` specifies it, and it is limited to headings/editorial content.
- **TY-02** Monospace is allowed only for code, IDs, tokens, and keyboard shortcuts. It MUST NOT be used as a decorative label style.
- **TY-03** Load ≤ 2 families and ≤ 4 weights (400, 500, 600, plus 700 only if `design.md` needs it). Use `font-display: swap`. Prefer variable fonts.
- **TY-04** Do not use novelty, script, or ultra-thin (< 300) weights.

### 6.2 Type scale

Use only these sizes. Tailwind names in parentheses.

| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `text-xs` | 12px | 16px (1.33) | 400/500 | Metadata, captions, badges, helper text |
| `text-sm` | 14px | 20px (1.43) | 400/500 | **Default UI text**: body in app, labels, table cells, buttons |
| `text-base` | 16px | 24px (1.5) | 400 | Long-form body, marketing body, mobile inputs (prevents iOS zoom) |
| `text-lg` | 18px | 28px (1.55) | 500/600 | Section headings (app), lead paragraphs |
| `text-xl` | 20px | 28px (1.4) | 600 | Section/card headings, modal titles |
| `text-2xl` | 24px | 32px (1.33) | 600 | Page titles (app) |
| `text-3xl` | 30px | 36px (1.2) | 600 | Page titles (large), KPI values |
| `text-4xl` | 36px | 40px (1.11) | 600 | Marketing H2 |
| `text-5xl` | 48px | 1.1 | 600–700 | Marketing H1 (desktop) |
| `text-6xl` | 60px | 1.05 | 600–700 | Marketing hero only |

Rules:
- **TY-05** ≤ 5 distinct sizes per screen (excluding marketing hero).
- **TY-06** App UI body/control text MUST be 14px minimum (12px only for metadata/captions/badges). Marketing body 16–18px.
- **TY-07** Inputs on mobile MUST be ≥ 16px.
- **TY-08** Use fluid sizing (`clamp()`) only for marketing headings ≥ 36px: e.g., `clamp(2.25rem, 4vw + 1rem, 3.75rem)`. App UI text is fixed.

### 6.3 Weights

| Weight | Use |
|---|---|
| 400 | Body, descriptions, input text |
| 500 | Labels, buttons, table headers, nav items, tabs |
| 600 | Headings, key values, active nav, emphasized text |
| 700+ | Only marketing headlines when specified |

Rule: **no more than 3 weights in one screen**.

### 6.4 Line height

- Body: 1.5 (16px → 24px). UI text at 14px: 20px.
- Headings: 1.1–1.3 (tighter as size increases).
- Small text (12px): 1.33–1.5.
- Serif body (if specified): add +0.05–0.1 to line-height.
- Single-line UI controls: line-height = control inner height (no extra padding hacks).

### 6.5 Letter spacing

| Text | Tracking |
|---|---|
| ≥ 30px headings | `-0.02em` (`tracking-tight`) |
| 20–29px headings | `-0.01em` |
| Body/UI | `0` (normal) |
| ≤ 12px, all-caps (rare) | `+0.04em` |

- **TY-09** All-caps is prohibited as a general label style. It is allowed only for short (≤ 2 words) table/section labels that `design.md` explicitly specifies. Default is sentence case.
- Never letter-space lowercase body text.

### 6.6 Heading hierarchy

- One `h1` per page. Do not skip levels (h1 → h2 → h3). Choose the heading tag for structure, and size via classes.
- Two adjacent heading levels MUST differ by weight, size, or both, per HI-05.
- Headings are sentence case, no trailing punctuation (except question marks).
- Do not accent a single word in a headline with a different color/italic/underline as a stylistic habit.
- Do not add an eyebrow/kicker label above headings unless it carries real information (category, status, step count).

### 6.7 Paragraph width and alignment

- Max 75 characters per line (65ch preferred). Left-aligned, ragged-right. Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs.
- Do not justify text on the web.
- Paragraph spacing 1em; no indentation.

### 6.8 Numeric and data typography

- **DT-01** All numbers in tables, KPIs, prices, timers, and columns MUST use `font-variant-numeric: tabular-nums` (`tabular-nums`).
- **DT-02** Right-align numeric columns; align decimals consistently; use the same decimal places within a column.
- **DT-03** Use locale-aware formatting (`Intl.NumberFormat`, `Intl.DateTimeFormat`). Thousands separators for ≥ 4 digits (unless IDs/years). Currency symbol and code consistent within a view.
- **DT-04** Abbreviate large numbers (1.2K, 3.4M) only in space-constrained KPI/charts; show full value on hover/tooltip or in tables.
- **DT-05** Units are `text-muted`, one size smaller than the value, or same size with muted color. Never bold the unit.
- **DT-06** Dates: one format across the product (e.g., `12 Mar 2026` or locale default). Relative time ("2h ago") requires absolute time on hover/title.
- **DT-07** Negative values use a minus sign (−), not parentheses, unless in a financial context defined in `design.md`. Do not rely on color alone for sign (Section 13).
- **DT-08** Truncation: single-line `truncate` with a title/tooltip; multi-line `line-clamp-2|3` with expand where the content matters.

---

## 7. Color system

### 7.1 Palette architecture (fixed structure)

Every project MUST define exactly these families. Hues come from `design.md`; structure is fixed here.

| Family | Scale | Purpose |
|---|---|---|
| **Neutral** | 12 steps (50–950) | Backgrounds, surfaces, borders, text |
| **Primary (brand/accent)** | 9–11 steps | Primary actions, links, selection, focus |
| **Success** | 3+ steps (bg, border, fg) | Positive status |
| **Warning** | 3+ steps | Caution |
| **Danger/Error** | 3+ steps | Errors, destructive |
| **Info** | 3+ steps | Neutral information |

- **CO-01** **One** accent (primary) hue. A secondary accent is allowed only if `design.md` defines it, and it MUST NOT compete with primary in the same viewport.
- **CO-02** Semantic colors (success/warning/danger/info) are reserved for meaning. They MUST NOT be used as decoration or brand.
- **CO-03** Neutrals are tinted lightly toward the brand hue (chroma < 0.02 in OKLCH), or pure neutral. Do not use pure `#000` for text on white; use `text` token (≈ gray-950/900). Avoid pure `#fff` on `#000` in dark mode; use `text` ≈ gray-50/100 on ≈ gray-950.
- **CO-04** Use 60/30/10 as a proportion guide: ~60% background/surface neutrals, ~30% secondary neutrals/text, ≤ 10% accent.
- **CO-05** Do not pick palettes by eye. Generate full scales with a perceptual method (OKLCH steps, Radix Colors, or Tailwind palette) and store them as tokens.

### 7.2 Semantic token set (required)

Components MUST reference semantic tokens, never raw palette steps.

| Token | Light (reference) | Dark (reference) | Use |
|---|---|---|---|
| `--bg` | neutral-50 | neutral-950 | Page background |
| `--surface` | white | neutral-900 | Cards, panels, popovers |
| `--surface-subtle` | neutral-100 | neutral-850 | Table header, sidebar, inset areas |
| `--surface-hover` | neutral-100 | neutral-800 | Row/menu-item hover |
| `--surface-active` | neutral-200 | neutral-700 | Pressed/selected |
| `--border` | neutral-200 | neutral-800 | Default borders, dividers |
| `--border-strong` | neutral-300 | neutral-700 | Input borders, emphasized dividers |
| `--border-input` | ≈ neutral-450 (≥ 3:1 vs `--surface`) | ≈ neutral-500 (≥ 3:1 vs `--surface`) | Input, select, checkbox, radio, switch borders |
| `--text` | neutral-950 | neutral-50 | Headings, primary text |
| `--text-muted` | neutral-600 | neutral-400 | Secondary text, labels |
| `--text-subtle` | neutral-500 | neutral-500 | Placeholders, disabled, tertiary metadata (never for required info) |
| `--primary` | primary-600 | primary-500 | Primary fill |
| `--primary-hover` | primary-700 | primary-400 | Hover |
| `--primary-active` | primary-800 | primary-300 | Pressed |
| `--primary-fg` | white | (per contrast) | Text on primary |
| `--primary-subtle` | primary-50 | primary-950 | Selected row/nav bg |
| `--ring` | primary-500 | primary-400 | Focus ring |
| `--success-bg / -border / -fg` | success-50 / 200 / 700 | 950 / 800 / 300 | Success surfaces |
| `--warning-bg / -border / -fg` | warning-50 / 200 / 800 | 950 / 800 / 300 | Warning surfaces |
| `--danger-bg / -border / -fg` | danger-50 / 200 / 700 | 950 / 800 / 300 | Error surfaces |
| `--danger` | danger-600 | danger-500 | Destructive fill |
| `--info-bg / -border / -fg` | info-50 / 200 / 700 | 950 / 800 / 300 | Info surfaces |

Adjust step numbers to guarantee the contrast rules in 7.4; contrast wins over the reference steps.

### 7.3 Interaction color states

| State | Rule |
|---|---|
| Hover | Move 1 step on the same scale (darker in light mode, lighter in dark). Do not change hue. |
| Active/pressed | Move 2 steps from default. |
| Focus | 2px `--ring` outline with 2px offset; never removed. |
| Selected | `--primary-subtle` background + `--primary` text/indicator (not fill). |
| Disabled | `--surface-subtle` background, `--text-subtle` text, `cursor-not-allowed`, no hover. Do not rely on opacity alone for contrast-critical text; disabled controls are exempt from contrast minimums but MUST remain identifiable. |
| Visited link | Not styled differently in app UI. |

### 7.4 Contrast requirements (WCAG 2.2 AA minimum)

| Element | Minimum ratio |
|---|---|
| Body text and UI labels (< 18.66px bold / < 24px regular) | 4.5 : 1 |
| Large text (≥ 24px or ≥ 18.66px bold) | 3 : 1 |
| Icons, borders of inputs, focus rings, chart elements conveying data | 3 : 1 against adjacent colors |
| Text on primary/danger/success fills | 4.5 : 1 |
| Placeholder text | 4.5 : 1 recommended (never below 3 : 1); never use placeholder as label |

- Verify with a contrast tool for every text/background token pair in both themes. Record pairs in `design.md` or the tokens file.
- **CO-06** Never convey meaning with color alone. Pair with icon, text, pattern, or position.

### 7.5 Prohibited color practices

- Gradients for decoration, text gradients, colored glows, neon outlines
- Random hex values in components
- Rainbow chart palettes; more than 6 categorical series colors without grouping
- Using red/green as the only distinction
- Saturated backgrounds behind large content areas
- Translucent surfaces with blur used as the default surface style
- Different shades of the "same" gray across components (use tokens)

### 7.6 Gradients (narrow exception)

A gradient is allowed only if (a) `design.md` specifies it, or (b) it serves a functional purpose (e.g., scroll-fade mask at a scroll container edge, chart area fill at ≤ 15% opacity of a single hue, skeleton shimmer). Gradients MUST be single-hue and subtle.


---

## 8. Component design

Global component rules (apply to every component below):
- Corner radius from the radius scale (Section 16.3). Border 1px `--border` (containers) or `--border-input` (form controls). No shadow unless specified.
- Control heights from the control-size scale: **sm 32px, md 40px (default), lg 44px**. Touch layouts use ≥ 44px.
- Text 14px (md/sm) or 16px (lg/mobile inputs). Weight 500 for buttons/labels.
- Every component supports the states in Section 10 that apply to it.

### 8.1 Buttons

| Variant | Style | Use |
|---|---|---|
| Primary | Filled `--primary`, `--primary-fg` text | The one main action per scope |
| Secondary | `--surface` bg, 1px `--border-strong`, `--text` | Common alternative actions |
| Ghost | Transparent, `--text-muted`→`--text` on hover, `--surface-hover` bg on hover | Tertiary, toolbar, icon buttons |
| Destructive | Filled `--danger`, white text (or outline-danger for low-emphasis) | Delete/remove, always confirmed |
| Link | Text `--primary`, underline on hover | Inline navigation |

- **BT-01** Max **one primary** button per section/modal. Order in a group: Primary, then Secondary, then Ghost/Tertiary. In dialog footers: cancel/secondary on the left, primary on the right.
- **BT-02** Label = verb + object, sentence case, ≤ 3 words where possible ("Save changes", "Invite member"). No "Submit", "OK", "Click here".
- **BT-03** Padding: sm 12px, md 16px, lg 24px horizontal. Min width 64px. Icon-only buttons are square (32/40/44) with `aria-label` and tooltip.
- **BT-04** Icon-before-text gap 8px; icon size 16px (sm/md) or 20px (lg). Trailing arrows ("→") are not appended to labels by default.
- **BT-05** Loading state: replace leading icon (or add one) with a 16px spinner, keep width stable, set `aria-busy` and prevent double-submit.
- **BT-06** Buttons never wrap text. Long labels are shortened, not wrapped.
- **BT-07** Full-width buttons only on mobile forms/dialog footers and auth cards.

### 8.2 Inputs

- Height 40px (md), 32 (sm), 44 (lg/mobile). Padding 12px horizontal. Radius 6–8px. Border 1px `--border-input` (≥ 3:1 against the surface). Background `--surface`.
- **IN-01** Label above the input, always visible, 14px/500. Never use placeholder as label. Placeholder = example format only, `--text-subtle`.
- **IN-02** Helper text below, 12–13px `--text-muted`. Error replaces helper text, `--danger-fg`, with an icon.
- **IN-03** Required fields: mark optional fields with "(optional)" instead of asterisking required ones, unless most are optional.
- **IN-04** Use the correct `type`, `inputmode`, `autocomplete`, `autocapitalize`, `spellcheck`. Selects for ≤ 7 fixed options (native or accessible custom), combobox for larger sets, date picker for dates, textarea auto-grow for long text.
- **IN-05** Focus: 2px `--ring` outline (or border becomes `--primary` + ring). Error: border `--danger`. Disabled: Section 7.3.
- **IN-06** Prefix/suffix (currency, units, icons) are inside the field container, visually part of the control.
- **IN-07** Password fields have a show/hide toggle. Search inputs have a clear button when non-empty.

### 8.3 Forms

- **FM-01** Single-column layout. Two columns only for tightly related short pairs (first/last name, city/postcode, start/end date) at ≥ 768px; stacked on mobile.
- **FM-02** Group fields in sections with a heading (16–18px/600) and optional description; 32px between sections, 16–24px between fields (16 default).
- **FM-03** Validate on **blur** and on **submit**; re-validate on change after first error. Never validate while the user is still typing the first time, except for password strength/availability hints.
- **FM-04** On submit failure: focus the first invalid field, show an error summary at the top for ≥ 3 errors (with links to fields), keep all input.
- **FM-05** Submit button at the bottom of the form, left-aligned with fields (or right-aligned in dialogs). Do not disable it before submission unless nothing changed (in edit forms).
- **FM-06** Settings-style forms show a "Save changes" bar only when the form is dirty.
- **FM-07** Long forms (> 7 fields) use steps with a progress indicator ("Step 2 of 4"), and allow going back without data loss.
- **FM-08** Checkbox/radio: 16–20px control with 44px tap area via label; label to the right; group with a `fieldset`+`legend`.

### 8.4 Cards

- Use a card only when the content is a **self-contained, repeated, or actionable unit** (item in a collection, summary tile, pricing plan, form panel).
- Style: `--surface` bg, 1px `--border`, radius 8–12px, padding 16/24px, **no shadow** by default (shadow only on hover for clickable cards is prohibited by default; use border-color/bg change).
- **CD-01** Never nest a card inside a card. Use spacing, headings, or dividers inside.
- **CD-02** Page sections are NOT cards. A heading + content on the page background needs no container.
- **CD-03** Card header: title (16px/600) left, optional action right; description 14px `--text-muted`.
- **CD-04** Cards in a row have equal height and consistent internal alignment (footer actions pinned to the bottom).
- **CD-05** Clickable card: whole card is one link target; hover `--surface-hover`; focus ring; no lift/scale.

### 8.5 Tables (see also Section 14)

- Header: `--surface-subtle` or transparent with bottom border; 12–13px/500 `--text-muted`, sentence case, sticky.
- Rows: height by density (32/40/48), 1px bottom border `--border`, hover `--surface-hover`. No vertical grid lines, no zebra striping by default.
- **TB-01** Text left, numbers right, status/badges left, actions right-most in a fixed-width column.
- **TB-02** First column is the entity name (link/primary identifier), with secondary text below it in `--text-muted` if needed.
- **TB-03** Sortable headers show a sort icon and `aria-sort`. Default sort is explicit and visible.
- **TB-04** Include: empty, loading (skeleton rows, same count as page size or 5–8), and error states; pagination or virtualization for > 50 rows.
- **TB-05** Row actions: primary action on click; secondary actions in a "⋯" menu (`aria-label="Row actions"`). Show inline only for ≤ 2 frequent actions.
- **TB-06** Selection: checkbox column at the left; a bulk-action bar appears on selection showing the count and actions.
- **TB-07** Mobile (< 768px): horizontal scroll with pinned first column, or transform to a list of stacked cards with key fields (Section 11.5).

### 8.6 Navigation

- **NV-01** Current location MUST be visible: active item has `--primary-subtle` bg + `--primary` text/indicator + `aria-current="page"`.
- **NV-02** Nav labels are nouns/short noun phrases users understand ("Invoices", "Team"), not internal jargon. Icons accompany labels; icon-only nav requires tooltips and `aria-label`.
- **NV-03** Group related items under headings after 7 items; secondary/rare items go at the bottom (Settings, Help).
- **NV-04** Same nav structure and order on every page. Never reorder based on state.
- **NV-05** Sidebar: 240px, item height 36px (default density), radius 6px, icon 16–20px, gap 8px, collapsible to 64px with tooltips. Section headings 12px/500 `--text-muted`.
- **NV-06** Top navbar (marketing): 56–72px height, logo left, links center/right, one primary CTA at the far right. Sticky with a 1px bottom border on scroll (no shadow).
- **NV-07** Mobile: hamburger + drawer (5+ items) or bottom tab bar (≤ 5 top-level destinations, 56px height, icon + label).

### 8.7 Tabs

- For switching between **views of the same object**. Not for steps or navigation between pages of different objects.
- Style: text tabs with a 2px bottom indicator on the active tab (`--primary`), 14px/500, inactive `--text-muted`. Height 40px. Gap 24px. Count badges allowed.
- ≤ 6 tabs visible; overflow scrolls or moves to a "More" menu. Keyboard: arrow keys move focus, `role="tablist"`.
- Segmented control (pill-in-track) is for **filter/mode toggles** with ≤ 4 options.

### 8.8 Modals and dialogs

- Use for: focused, blocking tasks and confirmations. Do NOT use for content that could be a page or inline panel, or for flows > 1 screen.
- Width: 400px (confirm), 480–560px (form), 720px (complex). Max height 85vh with internal scroll (header/footer fixed). Radius 12px. Padding 24px. Scrim `rgba(0,0,0,0.4–0.5)`. Shadow token `shadow-lg` allowed.
- **MD-01** Structure: title (20px/600) + optional description + body + footer actions. Close (X) at the top-right, `aria-label="Close"`.
- **MD-02** Focus trap, focus moves into the dialog on open, returns to the trigger on close, `Esc` closes (unless there is unsaved data → confirm), scroll lock on the page.
- **MD-03** Confirmation copy: title states the action and the object ("Delete project 'Apollo'?"), body states the consequence, buttons named by action ("Delete project" / "Cancel"). Never "Yes/No".
- **MD-04** Never stack modals. Use drawers/sheets for supplementary detail (right side, 400–560px) and bottom sheets on mobile.
- Use a proper dialog primitive (Radix Dialog / React Aria), not custom divs.

### 8.9 Dropdowns, menus, popovers

- Panel: `--surface`, 1px `--border`, radius 8px, `shadow-md`, padding 4px; items 32–36px high, 8–12px horizontal padding, radius 6px, hover `--surface-hover`.
- Max height with scroll; width ≥ trigger width; flips when near viewport edges; 4–8px offset.
- Destructive items last, separated by a divider, in `--danger-fg`.
- Keyboard: arrows, Enter/Space, Esc, type-ahead. Use accessible primitives (Radix, React Aria, Headless UI).
- Do not use dropdown menus for < 3 actions that can be shown inline.

### 8.10 Tooltips

- For **supplementary** info or icon-only labels. Never for essential info, errors, or anything a touch user needs.
- Trigger on hover **and** keyboard focus, delay 300–500ms, `role="tooltip"`, max width 240px, 12–13px text, ≤ 2 lines. Dark surface with light text, radius 6px, no arrow required.

### 8.11 Badges and status pills

- Height 20–24px, padding 0 8px, 12px/500, radius 4–6px (or full pill when `design.md` says so; consistent across the product).
- Variants: neutral, primary, success, warning, danger, info. Use semantic `-bg`/`-fg` (subtle fill, colored text, optional 1px `-border`).
- **BG-01** Status badges include text (never color alone); optional 6–8px dot.
- **BG-02** ≤ 1 badge per table cell; ≤ 3 badges per card header. Do not use badges as decoration.

### 8.12 Alerts and banners

- Inline alert: `-bg` fill, 1px `-border`, `-fg` text, 16px padding, radius 8px, leading 16–20px icon, title 14px/600 (optional), message 14px/400, optional action link/button, optional dismiss.
- Use `role="alert"` (errors, urgent) or `role="status"` (info/success).
- Page-level banners: full width under the top bar; max one at a time; dismissible unless critical.
- Toasts: bottom-right (desktop) / top or bottom center (mobile), max width 360px, auto-dismiss 4–6s (persist on hover/focus), max 3 stacked, include Undo where reversible. Errors requiring action MUST NOT auto-dismiss.

### 8.13 Breadcrumbs

- Show when hierarchy depth ≥ 3. 14px, `--text-muted` links with `/` or chevron separators; current page is `--text`, non-link, `aria-current="page"`.
- Truncate the middle on mobile (`… /`). Do not use as the only navigation.

### 8.14 Pagination

- Prefer cursor/"Load more" for feeds; numbered pagination for tables/search results.
- Layout: "Showing 1–25 of 312" left (`--text-muted`), controls right: Previous, page numbers (max 7 with ellipsis), Next; page-size selector (10/25/50/100).
- Buttons ghost/secondary md-size; disabled at the ends; `nav aria-label="Pagination"`; current page `aria-current="page"`.
- Persist page/sort/filter in the URL.

### 8.15 Search

- Field with a 16px leading magnifier icon, placeholder describing scope ("Search invoices"), clear button, `⌘K` hint only if a command palette exists.
- Debounce 250–300ms; show loading; highlight matches; show recent searches or suggestions on focus; no-results state suggests actions (clear filters, check spelling, create new).
- Global search: command palette (`⌘K`/`Ctrl+K`) with grouped results and keyboard navigation.

### 8.16 Filters

- Place filters directly above the content they affect, in a toolbar row: search left, filter controls after, sort/view/actions right.
- Applied filters are shown as removable chips + "Clear all" + result count. Filters persist in the URL. Show active-count on a "Filters" button when collapsed.
- Filter changes update results immediately (or via explicit "Apply" for expensive/multi-field panels). Never require a page reload.
- Empty results with active filters: state the filters and offer "Clear filters".

### 8.17 Charts

- **CH-01** Chart type follows the question: trend → line; comparison → bar; part-to-whole (≤ 5 parts) → stacked bar or donut; distribution → histogram; correlation → scatter. No 3D, no pie with > 5 slices, no dual-axis unless unavoidable.
- **CH-02** Every chart has a title (what/period), units, labeled axes or direct labels, and a legend only if > 1 series. Prefer direct labels over legends.
- **CH-03** Color: 1 hue for single series; ≤ 6 categorical colors distinguishable in grayscale/colorblind-safe; use neutral gray for context/benchmark series and the accent for the focus series.
- **CH-04** Gridlines: light horizontal only (`--border`), no chart borders, no heavy fills. Axis text 12px `--text-muted`. Y-axis starts at zero for bars.
- **CH-05** Tooltips on hover/focus show exact values; provide a table/text alternative for accessibility (`aria-label` summary or data table toggle).
- **CH-06** Include empty (no data), loading (skeleton with chart footprint), and error states. Fixed aspect ratio/height to prevent layout shift.
- **CH-07** Animation on load: none or ≤ 300ms once. Never continuous.

### 8.18 Dashboards

- **DB-01** Page purpose: answer ≤ 3 questions (defined in `design.md`). Everything else is secondary or removed.
- **DB-02** Layout order: page header (title, date range, primary action) → KPI row (3–5 tiles) → primary chart/visual (largest) → supporting tables/lists.
- **DB-03** KPI tile: label (13px `--text-muted`), value (24–30px/600, tabular), delta (12–13px, semantic color + arrow icon + text like "+4.2% vs last month"), optional sparkline. Equal height, aligned baselines.
- **DB-04** One global date range/filter control affecting all widgets, displayed and persisted.
- **DB-05** No decorative widgets. Each widget has a title, a state set (loading/empty/error), and a link to detail if applicable.
- **DB-06** Widget grid uses the 12-column grid; heights consistent per row; ≤ 8 widgets above the fold on desktop.

---

## 9. Component consistency

- **CN-01 Single source.** Each UI pattern exists as exactly one component. Before writing markup with more than 3 utility classes for a repeated pattern, search for an existing component. If none exists, create one in the components directory; do not inline.
- **CN-02 Same job, same component.** All buttons use `<Button>`, all inputs `<Input>`, all status labels `<Badge>`, etc. Raw `<button className="...">` with custom styling is prohibited outside the primitive itself.
- **CN-03 Variants over forks.** Differences in appearance are expressed as `variant`/`size` props on one component, never by copying a component or overriding via ad-hoc classes.
- **CN-04 Props are constrained.** Variant/size props are enumerated unions, not free strings/classes. Component consumers MUST NOT pass color, spacing, or font overrides via `className` except for layout (width, margin in parent context, grid placement).
- **CN-05 Behavioral parity.** The same component exhibits the same keyboard behavior, focus style, loading behavior, error display, and disabled styling everywhere.
- **CN-06 Naming parity.** The same action has the same label everywhere (e.g., always "Delete", not "Remove" in one place and "Trash" in another), unless semantically different (remove from list vs. delete permanently).
- **CN-07 Placement parity.** The same kind of action is in the same place on every page (primary action top-right of page header; form actions at bottom; row actions in last column).
- **CN-08 Modification protocol.** Changing a shared component's appearance/behavior requires: (1) find all usages, (2) confirm the change is desired globally, (3) update all usages/tests, (4) report the change. Otherwise create a new variant, leaving existing variants untouched.
- **CN-09 Density and radius parity.** All components on a screen share the same density and radius family.
- **CN-10 Icon parity.** Each concept has exactly one icon (e.g., delete = trash icon everywhere).

---

## 10. States

### 10.1 State matrix (every interactive component MUST define the applicable states)

| State | Requirement |
|---|---|
| Default | Clear affordance; meets contrast |
| Hover | 1-step color shift (bg or border); `cursor-pointer` on clickable; not required on touch |
| Focus (`:focus-visible`) | 2px ring `--ring`, 2px offset; ≥ 3:1 against adjacent colors; never `outline: none` without replacement |
| Active/pressed | 2-step shift or `scale(0.98)`; immediate |
| Selected/checked | Uses `--primary` (fill for checkbox/radio/switch; subtle bg for nav/list rows) + non-color cue (check icon, indicator bar) |
| Disabled | Section 7.3; `disabled` attr or `aria-disabled`; explain why via tooltip/helper text where non-obvious |
| Loading | Spinner in place, width stable, `aria-busy`; block duplicate actions |
| Success | Confirmation (inline check or toast), auto-clears |
| Error | Border/icon/text in `--danger` + message text; `aria-invalid`, `aria-describedby` |
| Empty | See 10.2 |
| Skeleton | See 10.4 |
| Offline | See 10.5 |

### 10.2 Empty states

Every list, table, chart, and dashboard widget that can be empty MUST have an empty state with this structure:

1. **What this area is** (short heading, e.g., "No invoices yet")
2. **Why it's empty / what to do** (one sentence)
3. **One primary action** (button) that creates or imports content; optional secondary link (docs)

Variants:
- **First-use** (never had data): explanatory + CTA.
- **No results** (filters/search): state the query/filters, offer "Clear filters".
- **Cleared/completed** ("All caught up"): brief, no CTA needed.
- **No permission**: state what is restricted and who can grant access.

Style: centered within the container, max-width 360–400px, optional 32–48px monochrome icon or simple illustration (not required), heading 16–18px/600, text 14px `--text-muted`, 16px gaps.

### 10.3 Worst-case content testing (mandatory)

Every component/screen MUST be verified with:
- 0, 1, 2, and 1000+ items
- Very long text (60+ chars, no spaces) → truncate/wrap correctly, no overflow
- Very short/missing text, missing image/avatar (fallback initials/icon)
- Large and small numbers, negative numbers, zero
- RTL-safe layout when relevant (use logical properties `ms-`, `me-`, `ps-`, `pe-`)
- Translations ~30–40% longer

### 10.4 Loading and skeleton states

- **LD-01** First load of a content area: skeletons that match the final layout (same heights, widths, positions). No layout shift on load.
- **LD-02** Actions/mutations: inline spinner in the triggering control; optimistic update when the failure risk is low.
- **LD-03** Refetching existing data: keep old data visible + subtle indicator (top progress bar or small spinner); do not replace with skeleton.
- **LD-04** Skeleton style: `--surface-hover` blocks, radius equals the component's radius, optional slow (1.5s) pulse/shimmer. Respect reduced motion (static blocks).
- **LD-05** Full-page spinners only for initial app boot or route transitions with no cached shell. Never block the whole UI for a partial load.
- **LD-06** Delay showing skeletons/spinners by ~150–200ms to avoid flashing for fast responses; once shown, keep for ≥ 300ms.

### 10.5 Error and offline states

- **ER-01** Levels: field-level (inline), section-level (inline alert in the widget with retry), page-level (full state with retry/home), global (banner).
- **ER-02** Structure: **what happened** + **why (if known)** + **how to fix / next step** + **action** (Retry, Contact support, Go back). No raw error codes/stack traces in UI (put reference ID in small text if needed).
- **ER-03** 404: state that the page doesn't exist, link to home/parent. 403: state lack of permission and who to ask. 500: retry + status link.
- **ER-04** Offline (when relevant): persistent banner "You're offline. Changes will sync when you reconnect." Disable network-dependent actions with explanation; queue actions where supported. Cached content remains visible.
- **ER-05** Never lose user input after an error. Never show an error and success simultaneously.

---

## 11. Responsive design

### 11.1 Approach

- **Mobile-first CSS**: base styles = mobile; enhance with `sm:`, `md:`, `lg:`, `xl:` (min-width). Do not write desktop-first `max-width` overrides in Tailwind.
- Design and verify at **375px, 768px, 1024px, 1440px**. Also check 320px (no horizontal scroll) and ≥ 1920px (content stays in the max-width container).
- **RS-01** No horizontal page scroll at any width. Only intentional scroll containers (tables, code, carousels) scroll horizontally.

### 11.2 Breakpoints (fixed)

| Name | Min width | Layout |
|---|---|---|
| base | 0 | 1 column, 16px page padding, drawer/bottom nav |
| `sm` | 640px | Larger phones/landscape: 2-col cards allowed |
| `md` | 768px | Tablet: 2-col layouts, collapsed sidebar or drawer |
| `lg` | 1024px | Desktop: persistent sidebar, 3-col grids, 12-col grid |
| `xl` | 1280px | Wide: max container reached, content padding 32px |
| `2xl` | 1536px | Same as xl; centered container |

Do not introduce custom breakpoints. Use container queries (`@container`) for component-level responsiveness.

### 11.3 Fluid sizing and reflow

- Use relative units (`rem`, `%`, `fr`, `minmax`, `clamp`) for layout; `px` for borders/radii. Body text uses `rem`.
- Fluid typography (`clamp`) only for marketing headings (Section 6.2).
- Multi-column → single-column on reflow with the same reading/priority order. Sidebars on the right stack below (or hide behind a toggle) on mobile.
- Content order in the DOM equals visual order (do not rely on `order-*` to reorder meaning).
- Images: `max-width: 100%`, `height: auto`, explicit `aspect-ratio`; `srcset`/`sizes`/`next/image` for large images.

### 11.4 Navigation changes

| Viewport | Pattern |
|---|---|
| < 768px | Top bar with hamburger → drawer (left), or bottom tab bar (≤ 5 items). Page title in the top bar. |
| 768–1023px | Collapsed icon sidebar (64px) or drawer |
| ≥ 1024px | Persistent sidebar (240px) |

- Header actions collapse: primary action stays visible (icon + label or icon-only button if space is tight); secondary actions move to a "⋯" menu.

### 11.5 Tables, cards, forms on small screens

- **Tables**: Option A (default for data tables): horizontal scroll with sticky first column and a scroll shadow cue. Option B (≤ 5 key fields, list-like data): transform rows into stacked cards showing title, 2–3 key fields, status, and a "⋯" menu. Never shrink text below 12px to fit.
- **Cards**: 1 column on mobile with full-width cards; 2 at `sm`/`md`; 3–4 at `lg+`.
- **Forms**: single column; full-width inputs and buttons; sticky primary action at the bottom for long forms (with safe-area padding); correct mobile keyboard types.
- **Modals**: full-screen or bottom sheet on mobile (< 640px), with a visible close control.
- **Toolbars/filters**: collapse into a "Filters" button opening a sheet; horizontal scroll for chip rows.

### 11.6 Touch targets

- **TT-01** Minimum interactive target **44 × 44px** on touch layouts (24 × 24px absolute WCAG minimum for dense desktop controls, with ≥ 8px spacing). Expand hit area with padding or pseudo-elements without changing the visual size.
- **TT-02** ≥ 8px between adjacent targets.
- Hover-only interactions are prohibited; every hover behavior has a tap/focus equivalent.
- Respect safe areas (`env(safe-area-inset-*)`) for fixed bars.

---

## 12. Micro-interactions and motion

### 12.1 When motion is allowed

Motion MUST do one of: (1) confirm an action, (2) show spatial relationship/what changed (open/close, expand/collapse, reorder, enter/exit), (3) indicate progress/loading. Otherwise it is prohibited.

### 12.2 Tokens

| Token | Duration | Use |
|---|---|---|
| `duration-fast` | 100ms | Hover/press color, toggles, checkbox |
| `duration-base` | 150–200ms | Dropdown, tooltip, tab indicator, accordion |
| `duration-slow` | 250–300ms | Modal, drawer, page/section transitions |
| max | 400ms | Anything longer is prohibited (except progress indicators, skeleton pulse 1.5s) |

| Easing | Value | Use |
|---|---|---|
| `ease-out` (enter) | `cubic-bezier(0.2, 0, 0, 1)` | Elements entering / responding to input |
| `ease-in` (exit) | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving |
| `ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Moving/resizing on screen |

Exit animations are ~20% shorter than enter animations. No `linear` except for spinners/progress. No spring/bounce/overshoot unless `design.md` requires it.

### 12.3 Rules

- **MO-01** Animate only `opacity` and `transform` (and `background-color`/`border-color`/`color` for state changes). Never animate `width`, `height`, `top`, `left`, `margin` on load-critical layouts (use `grid-template-rows` 0fr→1fr for accordions or measured height).
- **MO-02** Hover: color/background shift only, 100–150ms. No lift, scale, tilt, or glow on cards/buttons by default.
- **MO-03** Press: optional `scale(0.98)` on buttons, 100ms.
- **MO-04** Overlays: fade + small translate (4–8px) or scale from 0.96, 150–200ms. Scrim fades in 150–200ms.
- **MO-05** Page/route transitions: none by default; or a ≤ 200ms fade of the content area. No slide-in of entire pages on desktop.
- **MO-06** Lists: animate insert/remove (fade/collapse ≤ 200ms) only for user-triggered changes. Reorder uses layout animation.
- **MO-07** Feedback: success check icon fade/scale 150ms; error field shake is prohibited (use color + message); toasts slide/fade 200ms.
- **MO-08** Loading: spinners (linear, 700–1000ms/rotation) and skeleton pulse only. No decorative loaders.

### 12.4 Prohibited motion

- Scroll-triggered fade/slide-up reveals on every section
- Parallax, scroll-jacking, auto-playing carousels, marquees (except where `design.md` specifies)
- Looping/ambient animations (floating shapes, pulsing glows, gradient shifts)
- Hover lift/zoom on every card, staggered entrance of all list items on page load
- Animated counters on load, typewriter effects (unless the product's function)
- Any animation > 400ms that blocks interaction

At most **one** orchestrated page-load moment per page (e.g., a hero reveal) is allowed if `design.md` calls for it.

### 12.5 Reduced motion

- **MO-09** MUST respect `prefers-reduced-motion: reduce`: remove transforms/parallax/slide; keep instant or simple ≤ 100ms opacity changes; stop autoplay/loops; skeletons static.
- Provide a global CSS rule: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }`.
- Never convey essential information through motion alone.

---

## 13. Accessibility (WCAG 2.2 AA minimum)

### 13.1 Contrast
See Section 7.4. Verify both light and dark themes and all interaction states (hover, selected, disabled-but-informational).

### 13.2 Keyboard navigation
- **AX-01** Every interactive element is reachable and operable by keyboard. Tab order follows the visual/DOM order. No positive `tabindex`.
- **AX-02** Standard keys: `Enter`/`Space` activates buttons; `Enter` follows links; `Esc` closes overlays; arrows navigate menus, tabs, radio groups, listboxes; `Home/End` in lists where relevant.
- **AX-03** Provide a "Skip to main content" link as the first focusable element on pages with repeated navigation.
- **AX-04** No keyboard traps except modal focus traps with an `Esc`/close exit. Restore focus to the trigger on close.
- **AX-05** Custom shortcuts are single-key only when they can be disabled or remapped; prefer modifier combos.

### 13.3 Focus
- **AX-06** Focus is always visible: 2px ring, ≥ 3:1 contrast, 2px offset, using `:focus-visible`. Never `outline: none` without an equivalent replacement.
- **AX-07** Focused elements must not be obscured by sticky headers/footers (`scroll-padding-top`).
- **AX-08** Manage focus on route changes and dynamic content: move focus to the new page's `h1` or main region; announce important updates.

### 13.4 Touch targets
See Section 11.6. Minimum 24×24px (WCAG 2.2), target 44×44px.

### 13.5 Semantic HTML
- **AX-09** Use native elements first: `button`, `a`, `input`, `select`, `textarea`, `label`, `nav`, `main`, `header`, `footer`, `aside`, `section` (with heading), `ul/ol/li`, `table` (with `th scope`), `dialog`.
- **AX-10** Never use `div`/`span` with `onClick` as a control. If a custom widget is required, use an accessible primitive (Radix, React Aria, Headless UI) instead of hand-rolling ARIA.
- **AX-11** Landmarks: exactly one `main`; label multiple `nav`s with `aria-label`.
- **AX-12** Headings are hierarchical (Section 6.6). Lists use list markup. Data tables use table markup with `caption` or `aria-label`.
- **AX-13** ARIA only when native semantics cannot express the pattern. No redundant roles (`role="button"` on `<button>`).

### 13.6 Screen readers
- **AX-14** Icon-only controls have `aria-label`. Decorative icons/images: `aria-hidden="true"` / `alt=""`. Informative images: descriptive `alt` (not "image of").
- **AX-15** Dynamic updates: `aria-live="polite"` (status, success, results count) or `role="alert"` (errors). Loading regions use `aria-busy`.
- **AX-16** Links have meaningful text out of context ("View invoice 1042", not "Click here"); links opening new tabs indicate it visually and via text (`rel="noopener noreferrer"`).
- **AX-17** State is exposed: `aria-expanded`, `aria-selected`, `aria-current`, `aria-pressed`, `aria-checked`, `aria-disabled`, `aria-sort`.
- **AX-18** Page has a unique `<title>` and `lang` attribute.

### 13.7 Forms
- **AX-19** Every input has a programmatically associated `<label>` (`htmlFor`/`id`). Group related controls with `fieldset`/`legend`.
- **AX-20** Errors: `aria-invalid="true"`, `aria-describedby` → error text id; error text is visible text (not color alone). Provide an error summary for multi-error forms.
- **AX-21** Helper text and requirements are associated via `aria-describedby`. Use `autocomplete` tokens for personal data fields.
- **AX-22** Do not rely on placeholder for instructions. Do not clear/disable paste on inputs.

### 13.8 Motion and visual
- **AX-23** Respect reduced motion (Section 12.5). No flashing > 3 per second.
- **AX-24** Support zoom to 200% and text resize without loss of content or function; reflow at 320 CSS px width.
- **AX-25** Don't disable pinch-zoom (`user-scalable=no` prohibited).
- **AX-26** Respect `prefers-color-scheme` and `prefers-contrast` where the theme system supports them.
- **AX-27** Time limits and auto-dismiss: notifications with actions persist; provide controls to pause/extend.

### 13.9 Verification
Before completion: keyboard-only walkthrough of every flow; automated audit (axe / Lighthouse) with zero critical/serious issues; screen-reader spot check of the primary flow; contrast check of new color pairs.

---

## 14. Data-dense / enterprise UI

Goal: high information density without visual noise. Density comes from **tight, consistent structure**, not from small text or decoration.

### 14.1 Principles
- **EN-01** Choose Compact (32px) or Default (40px) density for the whole surface (Section 3.4). Font stays ≥ 12px (13–14px preferred).
- **EN-02** Remove visual chrome before removing data: drop card borders, zebra stripes, vertical grid lines, heavy headers, and icon clutter first.
- **EN-03** Structure via alignment: strict column alignment, consistent row heights, consistent number formatting. The grid is the design.
- **EN-04** Use hierarchy levers (Section 3): `--text` for the identifier/value, `--text-muted` for context. Color only for status/exceptions so anomalies stand out.
- **EN-05** Exceptions must be visible: status badges, semantic delta colors, and icons appear only on rows/values that need attention. If everything is highlighted, nothing is.

### 14.2 Tables and lists
- Column priority: identifier → status → key metrics → dates → owner → actions. Secondary columns are hideable via a column picker; the choice persists per user.
- Sticky header, sticky first column when horizontally scrolling, resizable/reorderable columns only when needed.
- Saved views/filters for repeated workflows. Bulk actions on selection. Inline edit only for simple single-field changes; complex edits open a drawer.
- Row click opens a detail drawer or page; the row shows a hover state and chevron/affordance.
- Show total counts and the active filter summary above the table.
- Keyboard: arrow-key row navigation and `Enter` to open for power-user tables.
- Virtualize > 200 rows; paginate server-side for large sets.

### 14.3 Admin panels and detail pages
- Detail layout: header (identifier, status badge, primary actions) → summary facts as a definition list (label `--text-muted` 13px, value `--text` 14px, 2–3 column grid, 16–24px gaps) → tabs for sections (Overview, Activity, Settings).
- Settings pages: left sub-nav or anchored sections; each section = heading + description + form; sticky save bar when dirty.
- Danger zone (delete/transfer) at the bottom, separated, using destructive styling and confirmation.
- Audit/activity logs: timeline or table with actor, action, object, timestamp (absolute on hover), filterable.

### 14.4 Complex dashboards
- Summary → detail. Top: KPIs and filters. Middle: one hero visualization. Bottom: tables. Link every summary to its detail view.
- ≤ 1 chart type per question; ≤ 8 widgets above the fold; consistent widget chrome.
- Use sparklines and inline deltas rather than more cards.
- Use consistent date-range, timezone, currency, and unit display and label them explicitly.
- Persist user layout/filter choices; make "Reset" obvious.

### 14.5 Permissions and roles
- Hide actions the user can never perform; disable (with tooltip explanation) actions blocked by state; show a 403 state for forbidden pages.
- Show role/permission context in headers where behavior differs by role.

### 14.6 Prohibited in enterprise UI
- Decorative illustrations inside data views
- Cards wrapping every table/section
- Icon-only actions without tooltips in dense toolbars
- Color-coding more than 5 statuses
- Infinite scroll for records users must reference or count

---

## 15. UX writing

### 15.1 Global rules
- **WR-01** Sentence case everywhere (headings, buttons, labels, menu items). Proper nouns retain capitals. No Title Case, no ALL CAPS.
- **WR-02** Plain language, active voice, second person ("you/your") or imperative for actions. Write at ~8th-grade reading level. No jargon, internal terms, or implementation terms ("webhook config" → "notifications").
- **WR-03** Say it once, with the fewest words that remain unambiguous. Delete filler ("Please", "Simply", "In order to", "Oops").
- **WR-04** One term per concept across the product; maintain a glossary in `design.md`. An action keeps the same name across button, confirmation, and toast ("Publish" → "Published").
- **WR-05** No exclamation marks (except rare celebration moments), no emoji in product UI, no puns, no marketing hype ("Supercharge", "Unlock", "Seamless") in the app.
- **WR-06** Numbers and units: numerals for all counts; include units; use plurals correctly ("1 item", "2 items").
- **WR-07** No lorem ipsum, "John Doe", "Company Name", or fake round numbers in shipped UI; placeholder content uses realistic, domain-specific data in the correct format.

### 15.2 Element-specific templates

| Element | Rule | Good | Bad |
|---|---|---|---|
| Button | Verb + object, ≤ 3 words | "Save changes", "Invite member" | "Submit", "OK", "Click here" |
| Destructive button | Names the action | "Delete project" | "Yes" |
| Cancel | Neutral | "Cancel" | "Never mind" |
| Page title | Noun or noun phrase | "Invoices" | "Manage all your invoices here!" |
| Section heading | Noun phrase, states topic | "Billing address" | "Let's talk about billing" |
| Field label | Noun, no colon | "Work email" | "Enter your work email address:" |
| Placeholder | Example value/format | "name@company.com" | "Type here…" |
| Helper text | What/why/format, ≤ 1 sentence | "Used for invoices. We never share it." | — |
| Tooltip | Clarify, ≤ 12 words | "Hidden from customers" | Repeat the label |
| Error (field) | What's wrong + how to fix | "Enter a valid email like name@company.com" | "Invalid input" |
| Error (system) | What happened + next step | "Couldn't save changes. Check your connection and try again." | "Error 500" / "Something went wrong" |
| Success toast | Past tense outcome | "Invoice sent" | "Success!" |
| Empty state | What it is + why empty + action | "No invoices yet. Create your first invoice to start getting paid." | "Nothing to see here 😢" |
| Confirmation title | Question naming the object | "Delete project 'Apollo'?" | "Are you sure?" |
| Confirmation body | Consequence + reversibility | "This permanently deletes 42 tasks. This can't be undone." | "This action is irreversible." |
| Loading | Progressive verb | "Saving…" | "Please wait" |

### 15.3 Error message rules
- Errors don't apologize, blame the user, or joke. State what happened and what to do.
- Never expose raw codes/stack traces; optionally show a short reference ID.
- Place next to the cause; specific to the failed rule ("Password must be at least 12 characters").

### 15.4 Microcopy
- Link text describes the destination or action ("View billing history").
- Menu items begin with verbs for actions ("Duplicate", "Export as CSV").
- Toggle labels describe the on state ("Email notifications"), not the action.
- Timestamps: relative for < 24h with absolute on hover; absolute otherwise.
- Truncate text with an ellipsis; never truncate essential info (amounts, statuses).

---

## 16. Visual polish (the last 10–20%)

### 16.1 Alignment and optical balance
- **PL-01** Left edges of headings, text, inputs, and cards in a column align exactly. Use the same container/padding at every level.
- **PL-02** Align text baselines across a row (`items-baseline`) for mixed sizes; align to center for controls of equal height (`items-center`).
- **PL-03** Optical corrections (documented in a comment): icons in circular buttons offset 1px for play/arrow glyphs; ligature/caps alignment; negative margin only when required.
- **PL-04** Visual weight balance: a heavy element on one side is balanced by whitespace/mass on the other; avoid lopsided page headers.

### 16.2 Icons and text
- Icon-to-text vertical alignment: centered to the line box (icon size = line-height ratio: 16px icon for 20px line; 20px icon for 24px line).
- Icon stroke width consistent (1.5px at 16–20px sizes, 2px for 24px), one icon set.

### 16.3 Radii (fixed scale)

| Token | px | Use |
|---|---|---|
| `radius-xs` | 4 | Badges, checkboxes, small chips |
| `radius-sm` | 6 | Buttons, inputs, menu items, tabs |
| `radius-md` | 8 | Cards (compact), popovers, dropdown panels, alerts |
| `radius-lg` | 12 | Cards (default), modals, large containers |
| `radius-full` | 9999 | Avatars, pills, switches |

- **PL-05** Pick one family per product (angular: 4/6/8; soft: 6/8/12) and apply consistently. Nested radius: inner = outer − padding (minimum 2px).
- **PL-06** Radii ≥ 16px are prohibited on data containers, inputs, and buttons (except full pills). Never 24px+ cards as a default style.

### 16.4 Borders and dividers
- 1px only (2px for focus/active indicators). Color `--border` (containers, dividers) / `--border-input` (form controls).
- Use borders **or** shadows **or** background contrast to separate a surface, not two or three at once.
- Dividers span the width of the content they separate; use sparingly (Section 5.3).

### 16.5 Shadows and layering

| Token | Value (light) | Use |
|---|---|---|
| `shadow-none` | none | Cards, panels, inputs (default) |
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Raised controls, segmented-control thumb, sticky bar |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Dropdowns, popovers, tooltips |
| `shadow-lg` | `0 12px 32px rgba(0,0,0,0.12)` | Modals, drawers |

- **PL-07** Shadows indicate **elevation over content** (things that float). Static content sits flat. Never use colored shadows; never stack shadow + border + gradient.
- **PL-08** Z-index scale: base 0, sticky 10, dropdown 20, overlay/scrim 30, modal 40, toast 50, tooltip 60. No arbitrary z-index values.
- In dark mode, express elevation with lighter surface color + border; reduce or remove shadows.

### 16.6 Whitespace, proportions, and wrapping
- When a layout feels cramped, increase spacing by one scale step before changing anything else. When it feels sparse, reduce by one step.
- Content proportions: main content 2/3 – 3/4 width, aside 1/4 – 1/3; avoid 50/50 splits for content/aside.
- Images/media use consistent aspect ratios (16:9, 4:3, 1:1) within a set.
- **PL-09** Text wrapping: `text-wrap: balance` for headings/short blocks; `pretty` for paragraphs; no orphans/single-word last lines in headings; no mid-word breaks (`overflow-wrap: anywhere` only for URLs/IDs).
- **PL-10** No text touching container edges (≥ 12px padding); no icon touching text (≥ 4px).
- Ensure consistent heights of adjacent controls (e.g., a search input and adjacent buttons are the same height).
- Number and date columns aligned; avoid ragged units.

### 16.7 Final visual pass
Zoom to 200% and to 50%: check alignment, rhythm, and hierarchy at both. Screenshot and compare to a professional reference (Linear, Stripe, Vercel, GitHub) for spacing and restraint.

---

## 17. Icons and imagery

### 17.1 Icons
- **IC-01** One icon library per product (Lucide, Phosphor, Heroicons, or Radix Icons). Never mix libraries or stroke styles. Outline for default, filled only for the active state (e.g., active nav) if the set supports it and `design.md` allows it.
- **IC-02** Sizes: 14px (dense/inline with 12–13px text), **16px** (default with 14px text), 20px (nav, large buttons), 24px (empty states/headers, mobile nav). No other sizes.
- **IC-03** Color: inherits text color (`currentColor`). Muted by default (`--text-muted`), `--text` on hover/active. Status icons use semantic colors.
- **IC-04** Alignment: vertically centered to text line-height; 8px gap from text (6px for 14px icons). Icon-only buttons have padding making the target 32/40/44px.
- **IC-05** Icons supplement text; they don't replace it, except for universally understood actions (close, search, add, menu, settings, more) which require `aria-label` + tooltip.
- **IC-06** One concept = one icon (Section 9, CN-10).
- **IC-07** Don't use emoji as UI icons. Don't use icons purely as decoration in list items, headings, or cards when they carry no meaning.

### 17.2 Illustrations
- Use only when `design.md` requires them or in first-use empty/onboarding states. They must be a single consistent style, monochrome or brand-palette only, ≤ 160–240px, and never in dense data views.
- No AI-generated abstract blobs, 3D renders, or stock "team high-fiving" art.

### 17.3 Images and media
- Use real product screenshots or photography with purpose. Consistent aspect ratios, `object-fit: cover`, radius from scale, `alt` text (Section 13.6).
- Optimize: modern formats (AVIF/WebP), responsive `srcset`, lazy-load below the fold, explicit dimensions to prevent layout shift.
- Overlay text on images requires a scrim guaranteeing 4.5:1 contrast. Avoid text over busy images.
- Loading: neutral placeholder (`--surface-subtle`) or blur-up.

### 17.4 Avatars
- Sizes: 20, 24, 32, 40, 48, 64px; circle for people, rounded-square (radius-sm/md) for organizations/workspaces.
- Fallback: initials (1–2 chars) on a neutral or hashed subtle background, contrast-compliant. Never a broken image.
- Avatar stacks overlap by 25–30% with a 2px `--surface` ring and show a "+N" overflow (max 3–5 visible).

### 17.5 Decorative graphics
- **DG-01** Decorative graphics (patterns, shapes, gradients, backgrounds) are prohibited unless (a) specified in `design.md` or (b) they encode information. If used: static, low-contrast (≤ 10% contrast against the background), one per page max, `aria-hidden`.
- Logos: fixed clearspace (≥ 0.5× logo height), use the official assets; no effects.

---

## 18. Design system

### 18.1 Token layers

| Layer | Purpose | Example |
|---|---|---|
| **Primitive** (raw values) | The palette and scales | `--color-blue-600`, `--space-4: 16px`, `--radius-2: 8px` |
| **Semantic** (roles) | What a value is used for | `--primary`, `--surface`, `--text-muted`, `--border` |
| **Component** (optional) | Component-specific overrides | `--button-height-md`, `--input-border` |

- **DS-01** Components consume **semantic** (or component) tokens only. Primitives are consumed only by the token definitions.
- **DS-02** A new value is added by adding/adjusting a token, never by hardcoding in a component.

### 18.2 Required token categories

The token file MUST contain: color (Section 7.2), spacing (5.1), typography (font families, sizes, line-heights, weights, tracking), radii (16.3), shadows (16.5), z-index (16.5), motion durations/easing (12.2), control heights (8, "global rules"), breakpoints (11.2), containers (4.1).

### 18.3 CSS variables and theming

- Define tokens as CSS custom properties on `:root`; override for dark in `.dark` (or `[data-theme="dark"]`). Tailwind's theme maps to these variables (`colors: { surface: 'hsl(var(--surface) / <alpha-value>)' }` or Tailwind v4 `@theme`).
- **Theme strategy**: light + dark from day one when feasible; theme switching changes **only semantic token values**. No component contains `dark:` color overrides beyond token use; if a component needs `dark:` classes, the token set is incomplete—fix the tokens.
- Respect `prefers-color-scheme` by default with a manual override stored in a cookie/localStorage; avoid flash-of-wrong-theme with a pre-hydration script.
- Dark mode: no pure black (`#000`) backgrounds and no pure-white text; reduce saturation of accents; check contrast again; elevation via lighter surfaces.

### 18.4 Naming conventions
- Tokens: `--{category}-{role}-{variant}` in kebab-case (`--text-muted`, `--border-strong`, `--danger-bg`). Scale steps numeric (`50…950`).
- Never name tokens by value (`--gray-light`) or by usage location (`--sidebar-blue`). Name by role.
- Components: PascalCase files (`Button.tsx`), one component per file, exported by name, co-located variants/styles/tests.
- Props: `variant`, `size`, `tone`, `state` (`isLoading`, `isDisabled`); event handlers `onX`.

### 18.5 Primitives and composition
- Layers: **primitives** (Button, Input, Badge, Dialog… built on accessible headless libraries) → **composites** (FormField, DataTable, PageHeader, EmptyState) → **patterns/features** (InvoiceTable) → **pages**.
- Required primitives before building features: `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `Label/FormField`, `Card`, `Badge`, `Alert`, `Dialog`, `Drawer`, `DropdownMenu`, `Popover`, `Tooltip`, `Tabs`, `Table`, `Skeleton`, `Spinner`, `Toast`, `Avatar`, `EmptyState`, `PageHeader`, `Pagination`.
- Compose, don't configure: prefer composable parts (`Card`, `CardHeader`, `CardContent`) over prop-heavy monoliths.

### 18.6 Governance
- The token file and primitives are the **single source of truth**. Changes go through CN-08. Document each component (usage, variants, states) in Storybook/MDX or a `design.md` section.
- Deprecate rather than delete; migrate all usages in the same change.

---

## 19. Code implementation

### 19.1 HTML
- Semantic elements first (Section 13.5). One `h1`. Landmarks. Valid nesting (no `div` inside `p`, no interactive inside interactive).
- Content order = reading order. No layout tables.
- Every `img` has `alt`, `width`/`height`. Every input has a label. Buttons have `type`.

### 19.2 CSS
- Use custom properties from tokens; no hardcoded colors/sizes in component CSS.
- Layout with Grid/Flex, `gap`, `min-width: 0` on flex children that truncate, `aspect-ratio`, container queries. Avoid absolute positioning for layout, and avoid `!important` (except the reduced-motion reset).
- Avoid fixed heights; use `min-height`. Use logical properties (`margin-inline`, `padding-block`) for RTL-safe layouts.
- Keep specificity low and flat: single-class selectors; no ID selectors; avoid descendant chains and element selectors that fight utility classes.
- Use `100dvh` over `100vh` for mobile full-height layouts.

### 19.3 Tailwind CSS
- **TW-01** Colors, spacing, radii, shadows, font sizes come from the configured theme mapped to tokens. Use semantic colors: `bg-surface text-foreground border-border`, never `bg-gray-100`, `text-[#333]`, `bg-blue-600` inside feature components.
- **TW-02 No arbitrary values** (`p-[13px]`, `text-[15px]`, `w-[347px]`, `bg-[#f5f5f5]`). Allowed exceptions: (a) documented grid/template values (`grid-cols-[240px_1fr]` for shells), (b) `min-h-[…]`/`max-w-[…]` tied to a token, (c) CSS variable references (`bg-[var(--x)]` only when the token is not in the theme, then add it to the theme). Every other exception needs a comment.
- **TW-03** Only spacing-scale utilities: `1, 2, 3, 4, 6, 8, 12, 16, 24, 32` (+ `0.5`, `1.5` where specified). No `5, 7, 9, 10, 11`.
- **TW-04** Font sizes only `text-xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl`; weights `font-normal|medium|semibold`.
- **TW-05** Prefer `gap-*` and `flex`/`grid` to `space-x/y-*` and margins. Use `size-*` for equal width/height.
- **TW-06** Responsive classes are mobile-first, ordered `base → sm → md → lg → xl`, and only at defined breakpoints. Do not restate unchanged values at larger breakpoints.
- **TW-07** State variants used consistently: `hover:`, `focus-visible:`, `active:`, `disabled:`, `aria-[invalid=true]:`, `data-[state=open]:`. Use `focus-visible:` not `focus:` for rings.
- **TW-08** Class ordering by the official Prettier plugin. Merge conditional classes with `cn()` (`clsx` + `tailwind-merge`). Variants with `cva`.
- **TW-09** `@apply` only inside the base/component layer for primitives you cannot otherwise express (e.g., prose overrides). Do not create CSS utility classes to hide long Tailwind strings; extract a React component instead.
- **TW-10** Long class strings (> ~12 utilities) on one element signal a missing component or variant; extract it.
- **TW-11** Dark mode via semantic tokens (Section 18.3), not per-element `dark:` classes.

### 19.4 React / Next.js
- **RX-01** Component hierarchy: primitives (`components/ui`) → composites (`components/`) → features (`features/*`) → routes (`app/` or `pages/`). Pages assemble; they don't define styling.
- **RX-02** Components are typed, presentational by default, accept `className` for layout only (CN-04), forward refs and native props (`ComponentProps<'button'>`), and spread rest props.
- **RX-03** Use existing primitives; check `components/ui` before creating anything. Search the repo for a similar pattern first.
- **RX-04** Server Components by default in Next.js App Router; add `'use client'` only for interactivity/state. Fetch data on the server; show route-level `loading.tsx`/`error.tsx`/`not-found.tsx` states (Section 10).
- **RX-05** Use `next/image`, `next/font`, `next/link`. No `<img>`/`<a>` for internal navigation without reason.
- **RX-06** Every data-driven component handles loading, empty, error, and success (Section 10). Pass state via props/hooks (`isLoading`, `error`, `data`); no `undefined` renders or unguarded `.map`.
- **RX-07** Forms: controlled via a form library (React Hook Form + Zod or equivalent), validation schema shared by client/server, accessible error wiring (Section 13.7).
- **RX-08** No inline `style={{}}` except for truly dynamic values (e.g., computed widths/positions, CSS variable injection).
- **RX-09** Keep components small (< ~150 lines). Split when there are multiple responsibilities, repeated markup, or > 1 level of nested conditional rendering.
- **RX-10** Stable keys, no index keys for dynamic lists, memoization only when profiled.
- **RX-11** Icons imported individually (tree-shaken); one icon component wrapper enforcing sizes 14/16/20/24.

### 19.5 Avoiding duplicated styling
- If the same class string appears **3+ times**, it must become a component or variant.
- If two components differ by a few classes, unify them into one with a `variant` prop.
- Shared layout patterns (`PageHeader`, `FormSection`, `Stack`, `Grid`, `Container`) exist as components; use them instead of re-writing wrappers.

### 19.6 Maintainability
- Comment only non-obvious decisions (optical corrections, a11y workarounds).
- Keep design constants in tokens; keep copy in one place if the product is localized.
- Add/update stories or usage examples when changing shared components.
- Lint: ESLint (`jsx-a11y`, `tailwindcss/no-arbitrary-value` or equivalent), Prettier with Tailwind plugin, TypeScript strict. Run them before completion.

---

## 20. AI-specific rules

These rules exist because AI agents drift toward generic, decorative, and inconsistent UI. Each is a **hard constraint**.

### 20.1 Consistency and scope

- **AI-01 No inventing styles.** You MUST NOT introduce any color, font size, spacing value, radius, shadow, duration, or breakpoint that is not in the token set. If one seems missing, choose the nearest existing token and report the gap; propose the token, do not hardcode.
- **AI-02 Preserve the established design language.** If a codebase or `design.md` defines a look, all new UI MUST match it. Do not restyle, "modernize", or re-theme existing screens unless explicitly asked.
- **AI-03 Minimal footprint.** Change only what the task requires. Do not refactor unrelated components, rename tokens, change global CSS, or "clean up" neighbors. If a shared component must change, follow CN-08.
- **AI-04 Do not break existing components.** Before editing a shared component: search all usages, keep the existing API backward compatible, run type-check/lint/tests, and verify affected screens. Prefer adding a variant to modifying the default.
- **AI-05 Reuse before create.** Inspect existing components first (Section 22). Building a duplicate of an existing component is a defect.
- **AI-06 Follow existing patterns.** Match naming, file structure, state handling, and data-fetching patterns already in the repo.
- **AI-07 Never ignore tokens.** Raw hex, `rgb()`, arbitrary Tailwind values, and magic numbers in component code are defects (TW-01/02).
- **AI-08 Responsive parity.** Every new screen/component follows the same breakpoints, navigation transformations, and table/form/card behaviors as existing screens (Section 11). No screen ships desktop-only or mobile-only.

### 20.2 Visual restraint

| # | Rule |
|---|---|
| **AI-09** | **Gradients**: prohibited (Section 7.6) unless `design.md` specifies them. Never on buttons, cards, headings, backgrounds, or borders by default. |
| **AI-10** | **Purple/indigo/blue gradient or neon palettes** are prohibited as a default. Palette comes from `design.md`; without it, use neutral + one restrained accent and flag it as provisional. |
| **AI-11** | **Glassmorphism / backdrop-blur / translucent panels**: prohibited except a sticky header's subtle blur when `design.md` permits it. |
| **AI-12** | **Shadows**: use only `shadow-none/sm/md/lg` per Section 16.5. Cards have no shadow by default. No colored, layered, or glowing shadows. |
| **AI-13** | **Rounded cards everywhere**: use radii from 16.3 by component role; no radius > 12px on cards/containers. No `rounded-2xl/3xl` defaults. |
| **AI-14** | **Everything is a card**: page sections, form groups, and lists on the page background are not cards (CD-01/02). Max card nesting depth = 1. |
| **AI-15** | **Spacing**: only Section 5.1 scale; gaps between groups > gaps within groups. No mixed arbitrary paddings. |
| **AI-16** | **Colors**: only semantic tokens. One accent. No decorative color; status colors only for status. |
| **AI-17** | **Font sizes**: ≤ 5 per screen; only Section 6.2 sizes; no 15px/17px/13.5px unless in the scale. |
| **AI-18** | **Animation**: only per Section 12; none on scroll, none ambient; no hover lift/scale; no staggered entrances; nothing beyond 400ms. |
| **AI-19** | **Decoration**: every visual element must have a UX purpose (information, affordance, feedback, structure). Delete blobs, dividers-for-decoration, icon garlands, badges-as-ornaments, background patterns, and "hero" illustrations that convey nothing. |
| **AI-20** | **Generic AI dashboard**: do not produce the template of gradient stat cards + rounded chart cards + "Welcome back 👋" + activity feed. Derive dashboard content from the user's questions (DB-01) and real data structures. |

### 20.3 Typographic and content tells (prohibited)

- Eyebrow/kicker text above every heading, especially tracked ALL-CAPS mini-labels
- Numbered markers ("01 / 02 / 03") on content that is not a true sequence
- Highlighting a single word in a headline with color/italic/underline as a style habit
- Meta strings joined with middle dots (`A · B · C`) or "WORD — fragment" labels as decoration
- "→" appended to every link/button label
- Monospace font for small labels as an aesthetic choice
- Centered hero + three identical feature cards + gradient CTA band as the default layout
- Generic copy: "Unlock the power of", "Seamlessly", "Elevate your workflow", "Welcome back 👋", "Everything you need to…"
- Placeholder people/companies ("John Doe", "Acme Inc.") in shipped UI
- Emoji in headings, buttons, and empty states

### 20.4 Behavior rules for the agent

- **AI-21** Follow Section 22 before writing code and Section 23 after writing it. Do not declare completion before Section 24 passes.
- **AI-22** When `design.md` and this file conflict on accessibility/usability, this file wins and you MUST surface the conflict. When they conflict on brand/product specifics, `design.md` wins.
- **AI-23** When requirements are ambiguous, choose the option that is (a) more consistent with existing UI, (b) simpler, (c) more accessible. State the assumption in one sentence. Ask only if the ambiguity blocks correctness.
- **AI-24** Do not add features, pages, settings, or UI elements that were not requested or specified.
- **AI-25** Do not use placeholder assets or fake statistics as final content. Use realistic content structures and mark provisional content clearly in code comments/final message.
- **AI-26** Report deviations: any rule you had to break must be listed with rule ID and reason in the final message.

---

## 21. Design decision hierarchy

When rules or requirements conflict, resolve in this order. A higher item wins over every lower item.

| Priority | Concern | Resolves conflicts such as… |
|---|---|---|
| 1 | **Safety and correctness of user outcomes** (data loss, security, legal) | Confirmations vs. speed |
| 2 | **UX / task success** | Fewer steps vs. feature completeness |
| 3 | **Accessibility** | Compact design vs. 44px targets; subtle gray vs. 4.5:1 contrast |
| 4 | **Consistency** (with existing system and tokens) | New "better" pattern vs. existing pattern |
| 5 | **Information hierarchy** | Emphasis vs. balance |
| 6 | **Usability and performance** (speed, clarity, ergonomics) | Animation vs. responsiveness |
| 7 | **Responsiveness** | Desktop density vs. mobile clarity |
| 8 | **Aesthetics** (proportion, polish, brand feel) | Visual preference |
| 9 | **Decoration** | Always lowest; default is to remove |

Tie-breakers (apply in order): fewer elements → fewer distinct values → existing component → more accessible → simpler code.

Project-specific `design.md` requirements sit at level 4 (consistency/brand) unless they concern function, in which case they sit at level 2. They never override levels 1–3.

---

## 22. Pre-implementation process (mandatory, in order)

Complete and be able to summarize each step **before writing UI code**.

1. **Understand the user.** From `design.md` (personas) or the request: who, what device, what expertise, what context. Write the UX-01 sentence.
2. **Understand the task.** List the user's goal, the primary action (UX-02), required data, and success/failure outcomes.
3. **Read `design.md`.** Extract: brand, palette, typeface, tone, routes, page/component inventory, requirements, constraints.
4. **Inspect the design system.** Open the token file (`globals.css`, `tailwind.config`, theme), fonts, and icon library. Note available tokens; note gaps.
5. **Inspect existing components.** List `components/ui`, `components/`, and relevant `features/`. Read at least 2 existing screens similar to the target to learn patterns (layout, page header, empty states, table, forms).
6. **Identify reusable components.** Map each part of the UI to an existing component. List anything missing and whether it is a new primitive, composite, or variant (prefer variant).
7. **Establish hierarchy.** Assign T1/T2/T3 tiers (Section 3), name the single primary action, define reading order and grouping. Sketch a grayscale/ASCII wireframe in your notes.
8. **Define states.** For each data-driven region and interactive component: default, loading, empty, error, success, disabled, and worst-case content (10.3).
9. **Determine responsive behavior.** Specify layout at 375/768/1024/1440, navigation, table/cards/forms behavior (Section 11).
10. **Plan accessibility.** Semantic structure, headings, landmarks, focus order, labels, announcements.
11. **Then implement.** Build the smallest set of changes using existing tokens/components; add only what step 6 identified as missing.

If a step cannot be completed (e.g., no `design.md`), state the assumption and continue using Section 0.4.

---

## 23. Self-critique loop

After implementing, act as a senior product designer reviewing someone else's work. Perform every pass, record findings, fix, then repeat until a full pass finds zero violations.

### 23.1 Passes

| Pass | Questions (any "no" = defect) |
|---|---|
| **Hierarchy** | Is the primary action obvious in 5 seconds? Is there exactly one T1 per section? Does the squint test show the right order? |
| **Spacing** | Is every gap on the scale? Is inner gap < outer gap? Are section rhythms consistent? |
| **Alignment** | Do edges/baselines align? Are numbers right-aligned? Are icon/text pairs centered? |
| **Typography** | ≤ 5 sizes, ≤ 3 weights, line length ≤ 75ch, tabular numbers, sentence case, headings sequential? |
| **Color** | Only semantic tokens? One accent? Contrast verified for all pairs? Meaning not color-only? |
| **Consistency** | Same component for same job? Same labels/icons/placements as elsewhere? No new one-offs? |
| **Responsiveness** | Checked at 375/768/1024/1440? No horizontal scroll? Touch targets ≥ 44px? Tables/forms/nav adapted? |
| **Accessibility** | Keyboard-only flow works? Focus visible? Labels, alt, ARIA, headings valid? Reduced motion respected? |
| **Interaction states** | Hover/focus/active/disabled/loading/error/empty/skeleton exist and look right? |
| **Content** | Worst-case content tested? Copy follows Section 15? No lorem/placeholder? |
| **Visual maturity** | Does it look like a restrained professional product (Linear/Stripe/GitHub level)? Any AI tell from 20.2–20.3? |
| **Decoration** | For each visual element: what is its UX purpose? Remove anything without one. |

### 23.2 Procedure

1. Render or screenshot the UI in light and dark themes at the four widths (use the browser/preview tooling if available; otherwise inspect code and reason explicitly).
2. Write a list of **at least 5 concrete flaws** (or an explicit justified "none found" after all passes). Rank by impact (hierarchy > usability > consistency > polish).
3. Fix them, highest impact first.
4. Re-run the passes on the changed UI. Repeat until clean.
5. Run lint, type-check, tests, and an accessibility audit (axe/Lighthouse); fix issues.
6. Remove one more decorative or redundant element if any remain ("take one accessory off").
7. Summarize: what was built, tokens/components reused, new components added, deviations (with rule IDs), and open questions.

---

## 24. Final quality gate

A UI is **not finished** until every item is true. If an item cannot be met, list it as a documented deviation.

**Process**
- [ ] `design.md` and the existing token file/components were read before coding (Section 22)
- [ ] Self-critique loop was completed with fixes applied (Section 23)

**Hierarchy and layout**
- [ ] One primary action per section; T1/T2/T3 clearly distinct; squint test passes
- [ ] Content in a max-width container; text ≤ 75ch; forms ≤ 640px
- [ ] Consistent alignment; numbers right-aligned; no mixed alignments

**Tokens and consistency**
- [ ] Zero hardcoded colors, sizes, radii, shadows, durations; zero arbitrary Tailwind values (or each justified)
- [ ] Spacing only from the scale; ≤ 5 font sizes; ≤ 3 weights; one accent; one icon set
- [ ] Reused existing components; no duplicated patterns; shared components not broken
- [ ] Same actions use the same labels, icons, placements

**States and data**
- [ ] Loading (skeleton), empty, error, success, disabled, hover, focus, active defined for all relevant components
- [ ] Tested with 0/1/many items, long text, missing data, and large/small numbers
- [ ] No layout shift on load

**Responsive**
- [ ] Verified at 375, 768, 1024, 1440 (and 320 without horizontal scroll)
- [ ] Touch targets ≥ 44px; tables/forms/nav adapted; no hover-only interactions

**Accessibility**
- [ ] Contrast ≥ 4.5:1 text and ≥ 3:1 UI (both themes)
- [ ] Full keyboard operability with visible focus; correct focus management in overlays
- [ ] Semantic HTML, labels, alt text, ARIA only where needed, live regions for updates
- [ ] `prefers-reduced-motion` respected; zoom 200% works

**Visual maturity**
- [ ] No gradients, glows, glassmorphism, decorative shapes, or heavy shadows (unless specified in `design.md`)
- [ ] No nested cards; not everything is a card; radii from the scale
- [ ] Motion only where functional; ≤ 300ms typical; none ambient or on scroll
- [ ] Copy follows Section 15: sentence case, verb+object buttons, specific errors, real content
- [ ] No AI tells (Section 20.2–20.3)

**Engineering**
- [ ] Lint, type-check, tests pass; axe/Lighthouse shows no critical/serious issues
- [ ] Final message lists deviations with rule IDs

---

## 25. Anti-pattern library

| # | Amateur / AI-generated pattern | Why it fails | Professional replacement |
|---|---|---|---|
| 1 | Purple-blue gradient hero with glowing blob | Decorative, dated, generic | Flat background from tokens, strong headline (T1), real product screenshot or content |
| 2 | Gradient stat cards (4 colorful KPI tiles) | Color without meaning, competes for attention | Neutral KPI tiles/inline stats; color only on deltas |
| 3 | Card inside card inside card | Visual noise, wasted space | Flat sections separated by spacing; one card level max |
| 4 | `rounded-3xl` cards with big soft shadows | Toy-like, inconsistent | `radius-lg` (12px), 1px border, no shadow |
| 5 | Glassmorphism panels over gradient | Poor contrast, decoration | Solid `--surface` with 1px border |
| 6 | Hover lift + scale + shadow on every card | Distracting, non-functional | Background/border color change (100ms); no movement |
| 7 | Scroll-reveal fade-up on every section | Slows reading, motion for its own sake | Static content; one intentional page-load moment at most |
| 8 | ALL-CAPS tracked eyebrow above every heading | Template chrome, adds noise | Remove, or use real category/status text in normal case |
| 9 | One word of the headline in accent color/italic | Cliché emphasis | Plain headline; hierarchy via size/weight |
| 10 | "01 / 02 / 03" numbering on non-sequential features | False sequence | Icons only if meaningful, or plain headings |
| 11 | Emoji as icons ("🚀 Fast", "🔒 Secure") | Inconsistent, unprofessional | One icon set, 16–20px, or no icons |
| 12 | Placeholder-only inputs | Label vanishes, accessibility fail | Persistent label above input; placeholder as example only |
| 13 | Full-width forms stretched across 1200px | Poor scannability | `container-narrow` token (640px), single column |
| 14 | Centered multi-line body text | Hard to read | Left-aligned, ≤ 75ch |
| 15 | Five font sizes for five paragraphs; random weights | No hierarchy | Scale-only sizes; ≤ 3 weights; hierarchy by tier |
| 16 | Light gray text (#aaa) on white for content | Fails contrast | `--text-muted` ≥ 4.5:1; subtle only for placeholders/decoration |
| 17 | Multiple primary buttons in a view | No clear action | One primary; others secondary/ghost |
| 18 | "Submit", "OK", "Yes/No" buttons | Ambiguous | "Save changes", "Delete project" / "Cancel" |
| 19 | Vertical gridlines, zebra stripes, and borders on every table cell | Noisy | Horizontal 1px dividers, hover row, tight alignment |
| 20 | Left-aligned numbers, proportional digits | Hard to compare | Right-aligned, `tabular-nums`, consistent decimals |
| 21 | Spinner replacing the entire page | Layout jump, feels slow | Skeleton matching layout; keep stale data on refetch |
| 22 | Empty list with blank space or "Nothing here 😢" | Dead end | Heading + reason + primary action |
| 23 | "Something went wrong" toast | Not actionable | What happened + fix + retry, inline near the cause |
| 24 | Toast for every action, stacking 5 deep | Noise | Inline confirmation for local actions; toasts for global, ≤ 3 |
| 25 | Modal for everything, including long forms | Blocks and overwhelms | Page, drawer, or step flow; modal only for focused confirmations |
| 26 | `div` with `onClick` styled as a button | Not keyboard/screen-reader accessible | `<Button>` (native `button`) |
| 27 | `outline: none` with no replacement | Invisible focus | `focus-visible` ring, 2px, 3:1 |
| 28 | Color-only status (red/green dots) | Fails colorblind users | Badge with text + icon + color |
| 29 | Random paddings (13px, 22px, 27px) | Inconsistent rhythm | Spacing scale only |
| 30 | Hardcoded `#3B82F6` in a component | Breaks theming and consistency | `bg-primary` from tokens |
| 31 | Copy-pasted button styles in 12 places | Drift, unmaintainable | One `Button` with variants |
| 32 | Dashboard with 12 equal-size widgets | No priority | KPIs → one hero chart → supporting tables; ≤ 8 above fold |
| 33 | Pie chart with 9 slices, 3D effects | Unreadable | Sorted horizontal bars; direct labels |
| 34 | Fixed pixel widths and heights | Breaks on mobile/long content | Fluid layouts, `min-height`, `max-width`, `grid`/`flex` |
| 35 | Table forced to fit on mobile with 10px text | Unreadable | Scroll with pinned column or stacked-card layout |
| 36 | Tiny (24px) tap targets on mobile | Missed taps | 44px targets via padding |
| 37 | Mixed icon sets and stroke widths | Visual incoherence | One library, 1.5px strokes, standard sizes |
| 38 | Background patterns/blobs "for personality" | Decoration without purpose | Whitespace and typography carry personality |
| 39 | Long paragraph of marketing copy inside the app | Noise | One-sentence description; link to docs |
| 40 | Restyling the whole app while asked to add one page | Breaks consistency and scope | Reuse existing components and tokens; minimal footprint |

---

## 26. Localization and internationalization

- **LC-01** No hardcoded user-facing strings inside components when the product is or may be localized. Use i18n keys (next-intl, i18next, or equivalent). Strings are complete sentences with placeholders, never concatenated fragments.
- **LC-02** Format with `Intl`, never by hand: numbers, currency, dates, lists, plurals, relative time. Use the user's locale. Example: `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` produces lakh/crore grouping (₹12,34,567); `en-US` would produce ₹1,234,567. One locale-aware formatter per data type, defined once and reused.
- **LC-03** Design for **+40% text expansion**. No fixed-width buttons, tabs, or labels; use `min-width` and allow wrapping in non-control text. Truncate only with a tooltip or expand.
- **LC-04** Non-Latin scripts (Devanagari, Gujarati, Tamil, Arabic, CJK, etc.):
  - Font stack includes a script-specific family with real weights (e.g., Noto Sans Devanagari, Noto Sans Gujarati), loaded via `unicode-range` subsets; never rely on browser fallback.
  - Body line-height **≥ 1.6** for Indic scripts (they carry tall headstrokes and stacked marks); minimum text size **14px**, no 12px body copy.
  - No `letter-spacing`, no `text-transform: uppercase`, no synthesized italics or bold on scripts lacking them.
  - Test clipping of stacked marks in fixed-height controls (use `min-height`, not fixed `height`, on text containers).
  - Mixed-script strings: verify baseline alignment and that numerals render consistently.
- **LC-05** Use logical properties and utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`) so RTL works without rewrites. Mirror directional icons (chevrons, back arrows); do not mirror logos, media transport controls, numerals, or chart axes.
- **LC-06** Names, addresses, phones:
  - Use one **"Full name"** field unless the domain requires parts; never assume first/last order.
  - Address forms adapt to the country; do not require a postal code or state universally.
  - Phone: country selector + national number, stored as E.164; `inputmode="tel"`, `autocomplete="tel"`.
- **LC-07** Dates and time: store UTC, display in the user's timezone, show the timezone on schedules and multi-region data, respect the locale's week start and calendar conventions.
- **LC-08** No text baked into images. Avoid idioms and culture-specific metaphors in copy and icons.
- **LC-09** Language switcher labels each language in that language ("English", "हिन्दी", "ગુજરાતી"), never with flags. Persist the choice.
- **LC-10** Test with the longest translation and the most complex script in the supported set before completion.

---

## 27. Performance as UX

Performance is a design requirement. Targets are measured, not assumed.

| Metric | Target (p75, mid-range mobile, Slow 4G profile) |
|---|---|
| Largest Contentful Paint | ≤ 2.5s |
| Interaction to Next Paint | ≤ 200ms |
| Cumulative Layout Shift | ≤ 0.1 (aim 0) |
| Initial JS per route | ≤ 200KB gzipped (app), ≤ 100KB (marketing) |
| Hero/LCP image | ≤ 150KB, AVIF/WebP, `priority` only on the LCP image |

- **PF-01** Test on a throttled network and CPU profile (mid-range Android class), not only on a developer machine.
- **PF-02** No layout shift: explicit `width`/`height` or `aspect-ratio` on media, skeletons with final dimensions, reserved space for banners/ads/embeds, `font-display: swap` with size-adjusted fallbacks (`next/font` handles this).
- **PF-03** Load ≤ 2 font families / ≤ 4 files on first paint; subset and preload only the fonts used above the fold.
- **PF-04** Split heavy dependencies (charts, maps, editors, video players) with dynamic import; load on demand or on visibility.
- **PF-05** Virtualize lists/tables > 200 rows. Debounce search/filter input 250–300ms. Cache and dedupe requests (React Query/SWR/Server Components).
- **PF-06** Perceived speed: optimistic updates for low-risk mutations, prefetch on link hover/viewport entry, keep stale data visible while refetching (LD-03), feedback < 100ms.
- **PF-07** Animate only `transform`/`opacity` (MO-01). No JS-driven scroll animations.
- **PF-08** Cap concurrent heavy media (video streams, maps, WebGL) and pause off-screen instances.
- **PF-09** Avoid client-side rendering of static content; ship the minimum `'use client'` surface (RX-04).

---

## 28. Flow patterns: auth, onboarding, settings, notifications, billing

### 28.1 Authentication
- Layout: `container-narrow` (≤ 400–440px) centered, logo, title (24px/600), optional one-line description, form, one full-width primary button, secondary links below. No decorative side panels by default.
- **FL-01** Social/SSO buttons: equal width and height (40–44px), same variant, provider icon + "Continue with X", placed above or below a labeled "or" divider consistently.
- **FL-02** Show/hide password toggle; show password requirements **before** typing; never block paste.
- **FL-03** Errors must not reveal whether an account exists ("Email or password is incorrect"). Explain rate limits and lockouts with a time.
- **FL-04** OTP/2FA: a single labeled input (or segmented inputs backed by one field) with `autocomplete="one-time-code"`, `inputmode="numeric"`, auto-submit on completion, visible resend with countdown.
- **FL-05** Preserve the intended destination through login; return the user to it.

### 28.2 Onboarding
- **FL-06** Optimize for **time to first value**. Ask only what is needed now; defer profile completion.
- **FL-07** ≤ 5 steps, one decision per step, progress shown ("Step 2 of 4"), back allowed, skip allowed when not required, answers persisted.
- **FL-08** Prefer contextual empty states and inline hints over product tours. If a tour exists: ≤ 4 steps, dismissible, replayable from help.
- **FL-09** Setup checklists: ≤ 5 items, persistent until done or dismissed, each item deep-links to the action.

### 28.3 Settings
- Standard groups, in order: Profile, Account, Security, Notifications, Team/Members, Billing, Integrations, Danger zone.
- **FL-10** Pick one save model per page: **autosave** for toggles/switches (with a toast or inline "Saved"), **explicit save** for text forms (sticky save bar when dirty). Do not mix in one form.
- **FL-11** Every setting states its effect in one line of helper text. Destructive settings live in a "Danger zone" at the bottom and require confirmation (MD-03).

### 28.4 Notifications and permissions
- **FL-12** In-app notifications: inbox list (unread indicator, grouped by day, "Mark all as read"), severity from the fixed set (info, success, warning, error), badge counts capped at "99+".
- **FL-13** Ask for browser/OS permissions (notifications, location, camera) **in context** after explaining the benefit, never on page load. If denied, show how to enable and continue without blocking.
- **FL-14** Notification preferences are per event type × per channel, with sensible defaults and a clear "critical alerts always on" note where applicable.

### 28.5 Pricing and billing
- **FL-15** Plan comparison: ≤ 4 plans, current plan marked, one recommended plan at most, feature rows aligned, monthly/annual toggle stating the saving in concrete terms ("Save 20%"), price includes currency and billing period.
- **FL-16** Billing page: current plan, next charge date and amount, payment method, invoices table with download, and a cancel path that is as easy to find as upgrade.

### 28.6 Dark patterns (prohibited)
Confirmshaming copy, pre-checked marketing consent, hidden or multi-step cancellation, fake countdowns or scarcity, disguised ads, forced account creation before value, nagging modals that reappear after dismissal.

---

## 29. Real-time, monitoring, and operational UIs

For dashboards where people watch live data and act on events (security, operations, logistics, healthcare, civic systems). These rules extend Section 14.

- **RT-01 Severity model.** Fixed maximum of four levels: Critical, High/Warning, Medium, Info. Each level = color + icon + text label, used identically everywhere. Only Critical uses the full-saturation danger fill on a screen; everything else is subtle-fill. If everything is red, nothing is.
- **RT-02 Freshness and connection.** Show a live/connection indicator (Live, Reconnecting, Offline) and "Last updated" time on real-time views. Data older than its expected refresh interval is visibly marked stale.
- **RT-03 Stable under updates.** Live updates MUST NOT move what the user is interacting with. New items appear behind a "N new events" control when the user has scrolled or is focused on a row; provide **Pause live updates**. No auto-scroll while the user is reading. Never re-sort a list under the cursor.
- **RT-04 Alert lifecycle.** States: New → Acknowledged → Resolved (plus Escalated where relevant), recording who and when. Critical alerts persist until acknowledged; no auto-dismiss. Support bulk acknowledge, filtering by severity/state, and a full audit trail.
- **RT-05 Alert fatigue.** Deduplicate and group repeats, support mute/threshold rules, keep sound opt-in and severity-mapped, and cap simultaneous toasts (≤ 3) with the rest in an alert panel.
- **RT-06 Video and media grids.**
  - Fixed 16:9 tiles; selectable layouts (1×1, 2×2, 3×3, 4×4) plus a focused view.
  - Overlay metadata (name, status, timestamp) in the same corner on every tile over a scrim guaranteeing 4.5:1 contrast.
  - Each tile has explicit Loading, Live, Offline/Failed (with Retry), and No-permission states.
  - Cap concurrent streams, lazy-load off-screen tiles, stop hidden streams, and make tiles keyboard-focusable (Enter to expand).
- **RT-07 Maps.** One map style per product with a desaturated neutral basemap so markers carry the color. Cluster dense markers, provide a legend, encode marker categories by shape/icon as well as color, and keep list and map **selection synchronized** (selecting either highlights both). Provide a list/table alternative for accessibility and offer "fit to results".
- **RT-08 Timelines and logs.** Absolute timestamps with timezone (relative time on hover only), monotonic ordering, time-range filter, "Jump to now", and export.
- **RT-09 Control-room contexts.** Only when `design.md` says so: dark, low-glare theme; high contrast; larger targets for shared/wall displays; no ambient animation; motion only for state changes; no autoplay audio.
- **RT-10 Sensitive data.** Mask personal or restricted fields by default (partial IDs, names), reveal only with permission and an audit entry, watermark exports, and warn before session timeout. Show classification labels when policy requires.
- **RT-11 Search and retrieval.** Operational search supports structured filters (time range, source, severity, status, location) plus free text, with saved searches and results that are shareable via URL.

---

## 30. AI-powered feature UI

- **AF-01 Label and attribute.** Mark AI-generated content. Show sources/citations for factual claims. Show confidence only if it is calibrated; never invent percentages.
- **AF-02 Streaming.** Render incrementally into a stable layout, provide **Stop** and **Retry/Regenerate**, keep partial output on failure. Do not fake typewriter effects for non-streamed content.
- **AF-03 Human in the loop.** AI output is editable and reversible. Before any irreversible or high-impact action, show a preview/diff of what will change and require confirmation.
- **AF-04 States.** Working (with the current step when known), no result, low confidence, blocked/failed (with next step), and long-running (moves to background with progress and a notification).
- **AF-05 Input.** ≤ 4 suggested prompts/examples, visible limits (characters, file size/types), retained history, copy buttons on outputs, keyboard submit (`Enter`, with `Shift+Enter` for newline).
- **AF-06 No personification or glow.** No fake human avatars or names, no cute status phrases, no sparkle icons scattered across the UI, no gradient "AI glow". One consistent AI indicator icon at most, used only where AI involvement must be disclosed.
- **AF-07 Errors and limits.** Never expose raw model/API errors. State quota or rate limits with the reset time and an alternative action.
- **AF-08 Feedback.** Unobtrusive thumbs up/down and "Report a problem" on outputs.
- **AF-09 Privacy transparency.** State what data is sent to the model, what is stored, and offer controls, at the point of use.

---

## 31. Marketing and landing pages

- **MK-01 Structure (default order).** Hero (headline, subhead, one primary CTA, optional secondary, real product visual) → proof (real logos/metrics) → how it works or benefits (3–4 specific items) → detail sections → pricing (if applicable) → FAQ → final CTA → footer.
- **MK-02 Headline.** States what the product is and who it is for in ≤ 12 words; subhead ≤ 2 lines, concrete. No hype vocabulary (Section 20.3).
- **MK-03 One CTA.** Same primary label in the nav, hero, mid-page, and final CTA. One primary action per viewport.
- **MK-04 Real proof only.** No fabricated logos, testimonials, or metrics. If none exist, omit the section.
- **MK-05 Rhythm.** All sections share the container, spacing scale (96px/64px), and type scale. Do not repeat the same three-card grid for consecutive sections; vary structure by content (list, comparison, screenshot with annotation, table).
- **MK-06 Type.** H1 48–60px desktop / 32–36px mobile, body 18px, max 65ch, `text-wrap: balance` on headings.
- **MK-07 Visuals.** Real product screenshots or purposeful photography; consistent radius, border, and aspect ratio; no decorative blobs (Section 17.5).
- **MK-08 Forms.** Lead capture ≤ 3 fields.
- **MK-09 Footer.** ≤ 4 link columns, legal links, consistent with the nav vocabulary.
- **MK-10 Technical.** Semantic headings, unique `title`/meta description, Open Graph image, LCP/CLS budgets (Section 27).

---

## 32. Power-user and keyboard features

- **KB-01** Provide a command palette (`⌘K` / `Ctrl+K`) when the app has > 15 destinations/actions. Groups: Navigate, Actions, Recent; fuzzy search; arrow keys + Enter; shows shortcuts.
- **KB-02** Show shortcut hints in menus and tooltips using platform-correct symbols (⌘ on macOS, Ctrl elsewhere). Provide a `?` shortcut sheet.
- **KB-03** Never override browser/OS shortcuts. Single-key shortcuts are disabled while typing in inputs and can be turned off (WCAG 2.1.4).
- **KB-04** Every mouse-only feature (drag and drop, resize, context menus) has a keyboard alternative.
- **KB-05** Bulk operations: shift-click range select, `⌘/Ctrl+A`, and an "undo" toast after bulk changes.

---

## 33. Agent output contract

Every UI task ends with this report, in this order, kept concise:

1. **Summary**: what was built or changed, and where (file paths).
2. **Reused**: existing components and tokens used.
3. **Added**: new components/variants/tokens, each with justification for why reuse was not possible.
4. **States covered**: default, hover, focus, active, disabled, loading, empty, error, success, offline (mark N/A where irrelevant).
5. **Responsive**: widths checked (375/768/1024/1440) and behavior at each.
6. **Accessibility**: keyboard flow, focus, contrast pairs verified, landmarks/headings, reduced motion.
7. **Self-critique**: flaws found in Section 23 and how each was fixed.
8. **Deviations**: any rule broken, with rule ID and reason.
9. **Assumptions / open questions**: one line each.

Additional hygiene:
- **AG-01** Do not create files, routes, dependencies, or global styles beyond what the task requires. Adding a dependency requires justification and a check that an existing one cannot do the job.
- **AG-02** Do not rename or reformat unrelated code.
- **AG-03** When tooling allows, capture screenshots at the four widths in light and dark themes and inspect them before reporting.
- **AG-04** If a rule in this file cannot be satisfied within the requested scope, stop and report rather than improvising.

---

## Appendix A. Quick reference (numbers an agent must not stray from)

| Area | Values |
|---|---|
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 (Tailwind `1 2 3 4 6 8 12 16 24 32`) |
| Type sizes | 12, 14, 16, 18, 20, 24, 30, 36, 48, 60 |
| Weights | 400, 500, 600 |
| Line height | Body 1.5 (UI 14px → 20px), headings 1.1–1.3, Indic body ≥ 1.6 |
| Line length | ≤ 75 characters |
| Control heights | 32 / 40 / 44px |
| Touch target | ≥ 44px (absolute minimum 24px) |
| Radii | 4 / 6 / 8 / 12 / full |
| Borders | 1px; focus ring 2px + 2px offset |
| Shadows | none (default), sm, md (menus), lg (modals) |
| Motion | 100 / 150–200 / 250–300ms; max 400ms; opacity + transform only |
| Containers | 640 / 768 / 1024 / 1280px |
| Breakpoints | 640 / 768 / 1024 / 1280 / 1536px |
| Contrast | Text 4.5:1, large text 3:1, UI/borders/focus 3:1 |
| Sidebar / topbar | 240 (64 collapsed) / 56–64px |
| Table rows | 32 / 40 / 48px |
| Toasts | ≤ 3 stacked, 4–6s, errors persist |
| Tabs / options | ≤ 6 tabs, ≤ 7 choices per group, ≤ 7 top-level nav items |
| Performance | LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 |

---

## Appendix B. Starter implementation (Tailwind v4 + React)

Hues below are **provisional placeholders**. Replace them with the palette from `design.md`; keep the structure, the semantic names, and the contrast guarantees.

### B.1 `globals.css`

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

/* ---------- Semantic tokens (runtime, themeable) ---------- */
:root {
  --bg: #fafafa;
  --surface: #ffffff;
  --surface-subtle: #f4f4f5;
  --surface-hover: #f4f4f5;
  --surface-active: #e4e4e7;

  --border: #e4e4e7;
  --border-strong: #d4d4d8;
  --border-input: #8e8e98;          /* >= 3:1 on --surface */

  --text: #18181b;
  --text-muted: #52525b;
  --text-subtle: #71717a;           /* placeholders/metadata only */

  --primary: #0f766e;               /* PROVISIONAL */
  --primary-hover: #115e59;
  --primary-active: #134e4a;
  --primary-fg: #ffffff;
  --primary-subtle: #f0fdfa;
  --ring: #0f766e;

  --success-bg: #f0fdf4; --success-border: #bbf7d0; --success-fg: #15803d;
  --warning-bg: #fffbeb; --warning-border: #fde68a; --warning-fg: #92400e;
  --danger: #b91c1c; --danger-hover: #991b1b; --danger-on: #ffffff;
  --danger-bg: #fef2f2; --danger-border: #fecaca; --danger-fg: #b91c1c;
  --info-bg: #eff6ff; --info-border: #bfdbfe; --info-fg: #1d4ed8;
}

.dark {
  --bg: #09090b;
  --surface: #18181b;
  --surface-subtle: #1f1f23;
  --surface-hover: #27272a;
  --surface-active: #3f3f46;

  --border: #27272a;
  --border-strong: #3f3f46;
  --border-input: #71717a;

  --text: #fafafa;
  --text-muted: #a1a1aa;
  --text-subtle: #8e8e98;

  --primary: #2dd4bf;               /* PROVISIONAL */
  --primary-hover: #5eead4;
  --primary-active: #99f6e4;
  --primary-fg: #042f2e;
  --primary-subtle: #042f2e;
  --ring: #2dd4bf;

  --success-bg: #052e16; --success-border: #166534; --success-fg: #86efac;
  --warning-bg: #451a03; --warning-border: #92400e; --warning-fg: #fcd34d;
  --danger: #dc2626; --danger-hover: #ef4444; --danger-on: #ffffff;
  --danger-bg: #450a0a; --danger-border: #991b1b; --danger-fg: #fca5a5;
  --info-bg: #172554; --info-border: #1e40af; --info-fg: #93c5fd;
}

/* ---------- Map tokens into Tailwind utilities ---------- */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-subtle: var(--surface-subtle);
  --color-surface-hover: var(--surface-hover);
  --color-surface-active: var(--surface-active);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-border-input: var(--border-input);
  --color-foreground: var(--text);
  --color-muted-foreground: var(--text-muted);
  --color-subtle-foreground: var(--text-subtle);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-active: var(--primary-active);
  --color-primary-foreground: var(--primary-fg);
  --color-primary-subtle: var(--primary-subtle);
  --color-ring: var(--ring);
  --color-success-bg: var(--success-bg);
  --color-success-border: var(--success-border);
  --color-success-foreground: var(--success-fg);
  --color-warning-bg: var(--warning-bg);
  --color-warning-border: var(--warning-border);
  --color-warning-foreground: var(--warning-fg);
  --color-danger: var(--danger);
  --color-danger-hover: var(--danger-hover);
  --color-danger-foreground: var(--danger-on);
  --color-danger-bg: var(--danger-bg);
  --color-danger-border: var(--danger-border);
  --color-danger-text: var(--danger-fg);
  --color-info-bg: var(--info-bg);
  --color-info-border: var(--info-border);
  --color-info-foreground: var(--info-fg);
}

/* ---------- Static scales ---------- */
@theme {
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 12px rgb(0 0 0 / 0.08);
  --shadow-lg: 0 12px 32px rgb(0 0 0 / 0.12);
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
}

/* ---------- Base ---------- */
@layer base {
  * { border-color: var(--border); }
  body {
    background: var(--bg);
    color: var(--text);
    font-size: 0.875rem;            /* 14px app default */
    line-height: 1.25rem;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3 { text-wrap: balance; }
  p { text-wrap: pretty; }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  ::placeholder { color: var(--text-subtle); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}
```

Note: Tailwind's spacing utilities accept any integer, so TW-03 (scale-only spacing) is enforced by lint and review, not by the framework. Configure a lint rule (or a custom ESLint check) that flags `p-5`, `m-7`, `gap-10`, and arbitrary values.

### B.2 `components/ui/button.tsx`

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base: layout, type, states. No color here.
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium " +
    "transition-colors duration-100 ease-out active:scale-98 motion-reduce:active:scale-100 " +
    "disabled:pointer-events-none disabled:border-transparent disabled:bg-surface-subtle disabled:text-subtle-foreground " +
    "[&_svg]:shrink-0", // documented exception to TW-02: normalizes icon sizing inside the primitive
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        secondary:
          "border border-border-strong bg-surface text-foreground hover:bg-surface-hover active:bg-surface-active",
        ghost:
          "text-muted-foreground hover:bg-surface-hover hover:text-foreground active:bg-surface-active",
        destructive:
          "bg-danger text-danger-foreground hover:bg-danger-hover",
      },
      size: {
        sm: "h-8 px-3 text-sm [&_svg]:size-4",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-6 text-base [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export function Button({
  className, variant, size, isLoading = false, disabled, children, type = "button", ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)} // className: layout only (CN-04)
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
```

Default variant is `secondary` so that **primary must be chosen deliberately** (BT-01).

### B.3 Page header and empty state (composites every project needs)

```tsx
export function PageHeader({ title, description, actions }: {
  title: string; description?: string; actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, description, action }: {
  title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-12 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
```

---

*End of UI_DESIGN_RULEBOOK.md. Project-specific requirements belong in `design.md`.*
