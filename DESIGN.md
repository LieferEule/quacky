---
name: Quacky
description: Local speech-to-text for macOS; a Liquid Glass settings window where the duck asks and you answer.
colors:
  quacky-orange: "#ff6600"
  accent-ink-light: "color-mix(in oklab, #ff6600 90%, black)"
  accent-ink-dark: "color-mix(in oklab, #ff6600 60%, white)"
  daylight-paper: "#faf8f4"
  pond-night: "#0c0e0d"
  roast-ink: "#1a1512"
  warm-bone: "#ece7dd"
  reed-gray: "#808080"
  duck-line: "#2973db"
  duck-fill: "#ffffff"
  duck-bill: "#ff8c26"
  duck-print: "#6b9edb"
  glass-card-light: "rgb(255 255 255 / 0.72)"
  glass-card-dark: "rgb(255 255 255 / 0.07)"
  glass-control-light: "rgb(255 255 255 / 0.82)"
  glass-control-dark: "rgb(255 255 255 / 0.1)"
  glass-pop-light: "rgb(250 248 244 / 0.86)"
  glass-pop-dark: "rgb(32 32 36 / 0.86)"
  glass-rim-light: "rgb(0 0 0 / 0.07)"
  glass-rim-dark: "rgb(255 255 255 / 0.1)"
  glass-sheen-light: "rgb(255 255 255 / 0.95)"
  glass-sheen-dark: "rgb(255 255 255 / 0.14)"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "-0.01em"
  hero:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
  question:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: "20px"
  row-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "20px"
  tab:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
  description:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  bubble: "18px"
  bubble-tail: "6px"
  card: "16px"
  pond: "14px"
  pop: "12px"
  key: "7px"
  capsule: "999px"
spacing:
  row-x: "14px"
  row-y: "8px"
  group-gap: "16px"
  avatar-gap: "10px"
  chip-gap: "6px"
  page-x: "48px"
  titlebar-h: "52px"
components:
  duck-bubble:
    backgroundColor: "{colors.glass-card-dark}"
    rounded: "{rounded.bubble}"
  duck-avatar:
    backgroundColor: "{colors.glass-card-dark}"
    textColor: "{colors.accent-ink-dark}"
    rounded: "{rounded.capsule}"
    size: "28px"
  setting-row:
    typography: "{typography.row-title}"
    padding: "8px 14px"
    height: "44px"
  answer-chip:
    backgroundColor: "{colors.glass-control-dark}"
    textColor: "{colors.warm-bone}"
    typography: "{typography.label}"
    rounded: "{rounded.capsule}"
    padding: "0 11px"
    height: "26px"
  answer-chip-chosen:
    backgroundColor: "{colors.quacky-orange}"
    textColor: "#ffffff"
    rounded: "{rounded.capsule}"
  button-primary:
    backgroundColor: "{colors.quacky-orange}"
    textColor: "#ffffff"
    rounded: "{rounded.capsule}"
    padding: "5px 16px"
  button-secondary:
    backgroundColor: "{colors.glass-control-dark}"
    textColor: "{colors.warm-bone}"
    rounded: "{rounded.capsule}"
    padding: "5px 16px"
  key-cap:
    backgroundColor: "{colors.glass-control-dark}"
    textColor: "{colors.warm-bone}"
    rounded: "{rounded.key}"
    padding: "0 7px"
    height: "22px"
  section-tabs:
    typography: "{typography.tab}"
    width: "78px"
    height: "30px"
  glass-pop:
    backgroundColor: "{colors.glass-pop-dark}"
    rounded: "{rounded.pop}"
  model-card:
    backgroundColor: "{colors.glass-card-dark}"
    rounded: "{rounded.card}"
    padding: "12px 16px"
---

# Design System: Quacky

## Overview

**Creative North Star: "The Duck Speaks"**

The main window is macOS system glass (`NSGlassEffectView` on macOS 26, vibrancy before it) with a 52px title bar holding the traffic lights and a centred Glisse segmented control. Every settings group is a question the duck asks: a 28px duck avatar beside a translucent speech bubble, the bubble's heading is the question and its rows are the answers. Density is a native macOS settings pane: 13px rows, 11.5px descriptions under the label, controls on the trailing edge.

Depth comes from the window's own glass, not from painted backgrounds: on macOS the page is transparent and every surface is a translucent layer lit by a white top rim. Off macOS the same tokens fall back to flat, opaque surfaces on the palette background. Personality lives in the duck, its speech bubbles and the quack meter; everything else stays plain system UI.

**Key Characteristics:**

- System glass ground; surfaces are translucent panes with a 0.5px rim and a 1px inset top sheen.
- One accent, Quacky orange, fixed; text and icons in the accent go through accent ink.
- SF system type throughout, small and precise (11.5 to 17px).
- Short fixed choices are answer chips, not menus.
- Motion is a spring for what travels and a short ease-out for what appears.

## Colors

A warm neutral pair (paper by day, near-black pond by night) under glass, with one orange voice.

### Primary

- **Quacky Orange** (`quacky-orange`): fills only. Chosen answer chips, primary buttons, Glisse switch and slider fill (`--lg-on`, `--lg-fill`), the active model card's inner rim (70% mix), the drop pond's hover wash (10%) and rim (60%), text selection (28%).
- **Accent Ink** (`accent-ink-light` / `accent-ink-dark`, via `light-dark()`): the accent as text, icons and marks. Deepened 10% toward black on light ground, lifted 40% toward white on dark glass. Quack meter bars, `.text-logo-primary`, focus ring (75%).

### Neutral

- **Daylight Paper** / **Pond Night**: page background in light / dark; transparent on macOS where glass takes over.
- **Roast Ink** / **Warm Bone**: body text in light / dark. Secondary text is the same ink at 65% (descriptions, subtitles), 70% for the hero subline.
- **Reed Gray**: the base of the non-macOS glass fallbacks (control 10%, rim 20%, hairline 16%).
- **Glass card / control / pop / rim / sheen** (light and dark pairs above): the macOS translucent material set. Row dividers use `--glass-hair` (`rgb(0 0 0 / 0.07)` light, `rgb(255 255 255 / 0.08)` dark).

### The Duck ("Pfütze", shared with Puddle)

- **Duck Line** `#2973db`, **Duck Fill** white, **Duck Bill** `#ff8c26`, **Duck Print** `#6b9edb` (`--duck-*`): the duck as a character (`QuackyDuck`) wears its own colours, the same on light and dark, and does not follow the accent. Water-blue lines, white inside, orange bill, legs and feet (the cells between the legs too). Used for the duck avatar, the hero duck, the wordmark, the brooding duck and its wing, its footprints and the egg's outline. The one-colour `QuackyMark` stays for places that follow the text colour; the tray icons stay monochrome templates.

### Named Rules

**The Ink-Not-Fill Rule.** Accent as text or icon always uses accent ink; fills, rings and borders keep `#ff6600` exactly. Raw `--color-logo-primary` on text is a defect.

**The One Voice Rule.** Orange marks selection, chosen answers, switches and the meter. Status colours (red, yellow, green at 10% washes) appear only in alerts.

## Typography

**Body Font:** System UI (SF Pro on macOS), Tailwind's default `ui-sans-serif, system-ui, sans-serif`. No webfonts.

**Character:** macOS-native and quiet; hierarchy comes from weight steps (400/500/600) and half-pixel size steps, not from contrast in face.

### Hierarchy

- **Headline** (600, 17px/24px, -0.01em): section page title; every section except Dictate.
- **Hero** (600, 15px/20px): Dictate's status line ("Ready to quack").
- **Question** (600, 13.5px/20px): duck bubble heading; also model card names and the drop pond heading.
- **Row Title** (500, 13px/20px): a setting row's label.
- **Tab** (500, 12.5px): section tabs and menu-dropdown triggers.
- **Label** (500, 12px/16px): answer chips, page subtitle, alert text, key caps (600).
- **Description** (400, 11.5px/16px, ink at 65%): under every row title, clamped to two lines, full text on hover.

### Named Rules

**The Description-Under Rule.** A row explains itself in an 11.5px line under its title, never behind an info icon.

## Layout

A single centred column, `max-width: 42rem`, inside 48px side padding, below a 52px draggable title bar laid out as `1fr auto 1fr` (traffic lights, tabs, model selector). Groups stack with a 16px gap; each group is avatar plus bubble with a 10px gap. Rows are at least 44px tall with 8px by 14px padding, label capped at 62% width, control trailing. Stacked rows put the control full-width under the label. Minimum window 680 by 570.

## Elevation & Depth

Hybrid: the window glass provides depth; surfaces add only a top sheen, a hairline rim and, on macOS, a soft ambient shadow. Off macOS shadows are `none` and surfaces are flat.

### Shadow Vocabulary

- **Glass shadow** (`0 1px 2px rgb(0 0 0 / 0.04), 0 6px 20px rgb(0 0 0 / 0.05)` light, `0.22` dark): bubbles, cards, model cards.
- **Glass rim + sheen** (`inset 0 1px 0 var(--glass-sheen), 0 0 0 0.5px var(--glass-rim)`): every glass surface.
- **Control lift** (`0 1px 2px rgb(0 0 0 / 0.05)`; key caps 0.08): controls and key caps.
- **Pop** (`0 12px 32px rgb(0 0 0 / 0.18)` plus `backdrop-filter: blur(24px) saturate(1.8)`): menus, tooltips, toasts, dialogs.

### Named Rules

**The Pane-Not-Border Rule.** Emphasis on a glass pane is an inset accent rim (1.5px active, 1px featured), never a thick border.

## Shapes

Soft and continuous. Speech bubbles are 18px with a 6px tail corner at top-left, toward the avatar (`6px 18px 18px 18px`). Cards 16px, drop pond 14px, pop-overs 12px, menu triggers `rounded-lg`, key caps 7px. Buttons, chips, the avatar and meter-style progress bars are full capsules. Meter bars are 3px wide with 2px radius.

## Components

### Speech Bubble and Duck Avatar

The signature. A `section` with a 28px circular glass avatar (15px coloured duck, 6px top offset) and a bubble holding the question header (14px by 12px padding) and rows separated by glass hairlines. Bubbles settle in on `duck-say` (420ms ease-out, from 0.25 opacity, 8px down, 0.985 scale), staggered 60/120/180ms.

### Navigation

Glisse `SegmentedControl` centred in the title bar, 78 by 30px tabs, 12.5px/500. The lens glides between tabs and can be pressed and dragged. Sections: Dictate, Files, History, Models, App, About, plus Debug in debug mode. A page switch fades in over 240ms from 0.4 opacity.

### Answer Chips

`Dropdown variant="chips"` for short fixed enums: right-aligned capsules, 26px tall, 6px gap, glass control with sheen and rim. Hover lifts 1px, press scales to 0.96 on the paddle spring (260ms). Chosen: orange fill, white text, inner top highlight `rgb(255 255 255 / 0.3)`. Arrow keys move the choice. Disabled at 50%.

### Buttons

- **Shape:** capsule, 1px border.
- **Primary:** orange fill, white text, 5px by 16px, 14px text; hover 80% orange.
- **Secondary:** glass control; hover adds 30% orange wash and orange border.
- **Ghost / Danger / Danger-ghost:** transparent or red, for destructive and tertiary actions.

### Inputs / Fields

- **Menu dropdown:** glass control trigger, `rounded-lg`, 12.5px/500, min 180px, chevron rotates 180deg on open; list is a glass pop, options hover at 10% accent.
- **Switch and Slider:** Glisse, accent fill, switch at `--lg-scale: 0.3` (macOS settings size).
- **Focus:** 2px outline in accent ink at 75%, 2px offset, everywhere.

### Key Cap

Shortcuts shown as macOS glyphs (⌘ ⌥ ⌃ ⇧) in a 22px glass key: min 26px wide, 7px radius, 12px/600, rim and lift shadow.

### Dictate Hero and Quack Meter

A 36px coloured duck, the hero line, a subline with the key cap and the model, and a five-bar meter on the trailing edge (3px bars, 3px gap, 26px tall, accent ink). At rest the bars hold a still wave (5/9/13/9/5px, 55% opacity); while recording each bar is `4px + 20px * level` at full opacity, and the duck bobs (1100ms). Transcribing tilts the duck -6deg.

### Model Card

Glass card, 16px radius, 12px by 16px padding, name at question size, description 12px at 65%. Active wears a 1.5px inset orange rim at 70%; featured a 1px rim at 30%. Clickable cards lift 1px on hover and press to 0.99.

### Drop Pond

Files' drop target, 14px radius, quiet at rest; while a file hovers the window it takes a 10% orange wash and a 1.5px inset rim at 60% (200ms ease-out).

While a file runs, the drop target gives way to the brood: the pixel duck waddles in from the right, leaves webbed prints behind, hops onto a small sheet of text (40×22px) with its wing fluttering and breathes there, and the sheet shrinks with the reported progress on long files. At the end the duck leaves to the left, the sheet is squeezed away in three pushes, and an egg springs up and bounces where it was. The egg then flies in a curve down to the left into its row, bouncing twice as it lands. Clicking it wobbles the egg, a zigzag crack appears, the top half stays ajar like a lid, and the text grows out of the gap.

### Alert

Inline note, 14px by 10px padding, 16px lucide icon, 12px text. Inside a bubble an info note has no background, only an accent icon and 70% text; error/warning/success use 10% status washes.

## Do's and Don'ts

### Do:

- **Do** put every new settings group in a `SettingsGroup` bubble phrased as the duck's question.
- **Do** render short fixed enums (theme, sound, ducking speed, overlay) as answer chips; device lists and other open or long lists use the menu dropdown.
- **Do** route accent text and icons through `--accent-ink` (`text-accent-ink` or `.text-logo-primary`).
- **Do** build surfaces from `--glass-*` tokens so the non-macOS fallback stays flat and correct.
- **Do** honour `prefers-reduced-motion`: bubble, page and hero animations switch off.

### Don't:

- **Don't** paint an opaque background on the macOS window; the page is transparent over system glass.
- **Don't** reintroduce a sidebar of tiled grey rows or an info-icon tooltip for row descriptions.
- **Don't** add a second accent or let users recolour it; the accent is fixed `#ff6600`.
- **Don't** use thick borders for emphasis on glass panes; use the inset accent rim.
