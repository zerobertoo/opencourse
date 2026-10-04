---
name: OpenCourse
description: Members-area UI for a self-hosted course platform, one instance-configurable accent on flat graphite surfaces.
colors:
  instance-accent: "#2f6f5e"
  instance-accent-foreground: "#ffffff"
  instance-accent-dark: "#6fbfa6"
  instance-accent-dark-foreground: "#0d0e10"
  accent-tint: "#dfe9e2"
  accent-tint-foreground: "#1f4a3f"
  accent-tint-dark: "#1f2e27"
  accent-tint-dark-foreground: "#bfe3d6"
  night-background: "#111214"
  night-surface: "#17181b"
  night-ink: "#e8e9ec"
  night-muted: "#212327"
  night-muted-foreground: "#a3a6ad"
  night-hairline: "#31343a"
  night-input-border: "#646a73"
  cloud-paper: "#f6f7f8"
  surface: "#ffffff"
  ink: "#1a1c1f"
  muted: "#eceef0"
  muted-foreground: "#5a5d64"
  hairline: "#d4d7dc"
  input-border: "#868b94"
  destructive: "#b3261e"
  destructive-dark: "#f2877f"
  player-stage: "#000000"
  player-surface: "#17181b"
  player-control: "#212327"
  player-foreground: "#ffffff"
typography:
  display:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  numeric:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "0.75rem"
rounded:
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  control-sm: "36px"
  control-md: "40px"
  gutter: "16px"
  page-max: "1280px"
components:
  button-primary:
    backgroundColor: "{colors.instance-accent}"
    textColor: "{colors.instance-accent-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "{spacing.control-md}"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent-tint-foreground}"
    rounded: "{rounded.md}"
    height: "{spacing.control-md}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "{spacing.control-md}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "{spacing.control-md}"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
  badge-neutral:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  badge-success:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent-tint-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: OpenCourse

## Overview

**Creative North Star: "The Members Theater"**

A familiar course-platform members area: a hero for the lesson you are resuming, rows of covers you browse sideways, and a lesson page with the curriculum beside it. The screen stays out of the way so the course is the show. The default stage is dark neutral graphite, with a light variant; chrome is quiet and flat, and the single brand voice is the instance accent, which each instance owner can change. Olive is only the default.

The system is an Operate surface: scanability and consistency outrank expression. Depth comes from tonal layers and 1px hairline borders, and shadows appear only in response to state or on floating layers. Course covers, not decoration, supply color and personality; a course without an image gets a generated cover drawn from its id in the accent hue. Locked content says access is not granted; no price, purchase or buy-to-unlock UI exists anywhere.

**Key Characteristics:**
- Dark graphite by default, with a light variant; users who saved a choice keep it.
- One brand color, instance-configurable; every neutral is plain graphite with no hue.
- Every color is a CSS variable with a light and a dark value.
- Flat by default: tonal surface plus hairline border.
- One sans-serif for everything; mono only for numbers, durations and code.
- Logical properties throughout (`ms`, `me`, `ps`, `pe`, `start`) for future RTL.

**Known drift and open items.** The directional drift recorded earlier (light default, green-tinted dark, serif headings, grid home) is resolved. What remains:
- Touch targets at 375px are mostly 36 to 40px (icon buttons 40px, curriculum actions 36px, native checkboxes 16px), under the 44px guideline.
- Short count phrases ("4 of 10 lessons", "40%") are set in mono as a whole span, not digit by digit, because the number is embedded in a translated phrase.
- `PRODUCT.md`, `CLAUDE.md` and `docs/PRD.md` still list `#f4f6f2` as the brand background; the light page background is now `#f6f7f8`.

## Colors

One configurable accent over a quiet graphite neutral set. The dark theme is the default; the light theme swaps every value, and the accent is darkened or lightened per theme to stay at AA contrast.

### Primary
- **Instance Accent (default: Olive)** (`#2f6f5e` light, `#6fbfa6` dark): the default value of the per-instance accent. Used for primary buttons, active navigation, progress fill, focus ring, the logo mark and generated covers. Instance owners override it; the brand style layer recomputes both themes from one hex, reading its background and on-primary colors from `theme/neutralColors.ts`.
- **Accent Tint** (`#dfe9e2` / `#1f2e27`, text `#1f4a3f` / `#bfe3d6`): secondary buttons, the success badge, avatar fill and the generated cover background. It follows the instance accent.

### Neutral
- **Night Background** (`#111214`): the default page background.
- **Night Surface** (`#17181b`): cards, inputs, menus and dialogs in the dark theme; **Night Ink** (`#e8e9ec`) is body and heading text there.
- **Night Muted** (`#212327`) and **Night Muted Foreground** (`#a3a6ad`): neutral badges, hover fills, progress track, secondary text.
- **Night Hairline** (`#31343a`): every border and divider; **Night Input Border** (`#646a73`) outlines form controls at 3:1.
- **Cloud Paper** (`#f6f7f8`): the light theme page background only. Surface is `#ffffff`, Ink `#1a1c1f`, Muted `#eceef0`, Muted Foreground `#5a5d64`, Hairline `#d4d7dc`, Input Border `#868b94`.
- **Player Stage** (`#000000`), **Player Surface** (`#17181b`), **Player Control** (`#212327`) and **Player Foreground** (`#ffffff`): the video player is dark in both themes. A black **Scrim** sits under dialogs and the mobile staff menu.

### Semantic
- **Destructive** (`#b3261e` light, `#f2877f` dark): destructive buttons, invalid fields, the warning badge outline.

### Named Rules
**The One Voice Rule.** The accent is the only brand color and the only hue on the page. It marks actions, active state and progress, and nothing decorative.

**The Variable Rule.** No component hard-codes a hex. Everything resolves through the tokens so an instance accent override and the theme switch both work. A test fails if `index.css` drifts from the constants the accent derivation uses.

## Typography

**Display / Heading / Body / UI Font:** Inter Variable (system-ui, sans-serif)
**Numeric Font:** JetBrains Mono Variable (ui-monospace)

**Character:** one clean sans-serif voice carried by weight, with mono reserved for data. The only warmth in the interface comes from covers and the accent.

### Hierarchy
- **Display** (600, 30 to 36px, 1.25): the hero course title on the student home.
- **Headline** (600, `-0.01em` tracking): page and section headings; every h1 to h4 defaults to weight 600.
- **Title** (600, 18px, 1.375): card and lesson titles.
- **Body** (400, 14px): default UI and reading text.
- **Label** (500, 14px): buttons, tabs, form labels.
- **Numeric** (mono, 12px): lesson counts, percentages, durations.

### Named Rules
**The Numbers Are Mono Rule.** Counts, percentages and durations use the mono face; prose, names, URLs, e-mails and form text never do. Code blocks and the certificate code keep mono because they are code.

## Layout

Content sits in a centered container up to 80rem (`max-w-7xl`) with a 16px gutter. The student home opens with a hero (cover on the end side from `md`, stacked on mobile) followed by horizontally scrolling course rows grouped by progress: in progress, not started, completed. Rows bleed to the screen edge on mobile and show the next card peeking to signal scroll. The lesson page is two columns with a sticky curriculum beside the player; on mobile the curriculum hides behind a toggle. The student shell has a sticky 64px header (blurred background) holding logo, navigation, search and user menu; below `md` navigation becomes a horizontally scrolling row and below `sm` search moves to its own row. Studio and admin use a staff layout with the same header grammar. Controls are 40px tall (36px compact). Interfaces are verified down to 375px width. Spacing follows the Tailwind scale; blocks use 12 to 32px gaps.

## Elevation & Depth

Flat tonal layering. Cards are a surface fill with a hairline border and no shadow at rest. A medium shadow appears on card hover; a large shadow marks floating layers (dialogs, dropdown menus, the dragged curriculum item). Tab rows draw their hairline as an inset shadow so the row can clip its own overflow; that is a border, not depth. The focus state is a 2px accent outline with 2px offset, and cards use a ring on focus-within.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows answer hover, drag or float, never decoration.

## Shapes

Gently rounded and consistent: controls and inputs 8px (`rounded-md`), menus 10px, cards, hero and dialogs 14px (`rounded-xl`), badges and progress bars fully pill-shaped. Course covers are 16:9 and clipped by the card radius. Generated covers are flat compositions of circles, rounded squares and bars. Logo mark is a 32px rounded square.

## Components

### Buttons
- **Shape:** 8px radius, 40px high (36px small, 40px square icon), 16px horizontal padding, 14px medium label, 8px gap between icon and label.
- **Primary:** Instance Accent fill, white text (near-black graphite on the dark accent); hover at 90% opacity.
- **Secondary:** Accent Tint fill; **Outline:** Surface fill with hairline border, Muted on hover; **Ghost:** transparent, Muted on hover; **Destructive:** destructive fill.
- **Disabled:** 50% opacity, no pointer events.

### Cards / Containers
- **Corner Style:** 14px. **Background:** Surface. **Border:** 1px hairline. **Shadow:** none at rest, medium on hover.
- Course card: 16:9 cover on top, then a 16px-padded body with title, status badge, progress bar and mono counts. The whole card is one stretched link. In rows, cards are 72% wide on mobile and 288 to 320px from `sm`.

### Hero
- Split panel on Surface with a hairline border and 14px radius: text on the start side, cover on the end side. The title uses Display, with the lesson (or the course description) beneath, resume time, progress and a single primary action. With nothing in progress it features the first unfinished course with "Start course".

### Inputs / Fields
- **Style:** Surface fill, 3:1 input border, 8px radius, 40px high, 12px padding, muted placeholder (same on the topbar search). Textarea min 112px.
- **Focus:** global 2px accent outline. **Error:** destructive border via `aria-invalid`. **Disabled:** 60% opacity.

### Navigation
- Header links with an active state in the accent; tabs and the admin section nav use an underline: transparent border at rest, 2px accent border and full-contrast text when active, muted text otherwise, over an inset hairline.

### Badges and Progress
- Pill badges: neutral (Muted), success (Accent Tint), warning (destructive outline). Progress is an 8px pill track in Muted with an accent fill that slides by transform (mirrored in RTL).

### Course Cover
- A course image, or a generated cover: Accent Tint background with five accent-colored shapes at varied opacity, deterministic per course id.

## Do's and Don'ts

### Do:
- **Do** route every color through the CSS variables, with a light and a dark value.
- **Do** keep the accent for actions, active state, progress and generated covers only.
- **Do** keep neutrals hue-free graphite so any instance accent reads as the only color.
- **Do** use logical properties (`ms`, `me`, `ps`, `pe`, `start`) and flip transforms for RTL.
- **Do** let course covers carry visual identity.
- **Do** show locked content as "access not granted".

### Don't:
- **Don't** introduce a second brand color or a gradient.
- **Don't** add price, purchase, checkout or buy-to-unlock UI.
- **Don't** use shadows at rest; reserve them for hover, drag and floating layers.
- **Don't** use mono for prose, or hard-code UI strings outside i18n.
- **Don't** use a serif face or tint neutrals toward the accent.
- **Don't** animate layout properties such as width; use transforms.
