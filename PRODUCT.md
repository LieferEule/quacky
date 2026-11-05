# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Tauri v2 desktop app; the UI is a React webview inside a native macOS window.
macOS (Apple Silicon) is the only verified platform. Windows and Linux targets
are inherited and unverified.

## Users

Jamie, on a personal and a work Mac, plus a few friends and colleagues who
install the DMG from GitHub releases. They dictate into other apps all day
and rarely open Quacky's window. When they do, it is to transcribe an audio
file (voice notes, meetings) or to change a setting.

## Product Purpose

Local speech-to-text. Hold a shortcut, speak, and the text lands in the
focused app. Audio files can be dropped in and transcribed on the machine.
Nothing leaves the Mac unless AI post-processing is switched on. Success
means dictation that is fast and invisible, and a window that is quick to
read and pleasant to visit.

## Positioning

Fully local and offline once a model is downloaded. Works alongside Puddle,
the notch app ("the puddle Quacky paddles in"), which takes over the
recording UI while it runs.

## Operating Context

- Dictation runs from global shortcuts. The window is secondary: it opens
  from the menu-bar duck and is closed again soon after.
- File transcription happens in its own tab, not in the focused app, so long
  recordings are never typed out.
- Typical files are WhatsApp voice notes (Opus), iPhone Voice Memos (m4a)
  and meeting recordings up to about an hour.

## Capabilities and Constraints

- Sections since 0.4.2: Dictate, Files, History, Models, App, About, and
  Debug (hidden unless debug mode is on).
- Every setting maps to a Tauri command (`settingToCommand`). Regrouping is
  fine, but a setting stays reachable unless the user decides to drop it.
  The user dropped the AI tab (post-processing, voice actions), the accent
  picker and the experiments switch in 0.4.2. Their Rust side remains.
- en and de are the maintained languages, and their keys stay in sync.
  Twenty other locales exist and fall back to en.
- The window is 680×570 at minimum and can be resized.

## Brand Commitments

- Name Quacky, bundle `com.jamieandrew.quacky`. Never "Handy" in UI, assets
  or identity.
- The duck mark (`src-tauri/icons/app-icon.svg`,
  `src/components/icons/QuackyMark.tsx`) and the pixel-duck tray icons.
- Accent Quacky orange `#ff6600`, fixed. It is not user-changeable since
  0.4.2.
- Voice is playful, with duck wit where it fits ("Quacky is listening",
  "Nothing quacked yet"). Everything else stays clear and short, and the
  jokes never get in the way of an instruction.

## Evidence on Hand

No testimonials, press or usage numbers. None may be invented.

## Product Principles

1. The shortcut is the product, and the window serves it. Put the things
   people come for (a file to transcribe, the setting they want to change)
   within one look.
2. Local and private by default. Say so plainly wherever data could leave
   the Mac.
3. Duck personality in the details, never at the cost of clarity.
4. Every setting stays reachable. Regrouping is allowed, silently dropping a
   setting is not; removing one is the user's call.
