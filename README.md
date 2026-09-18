# Quacky

`Quacky` is a local-first desktop transcription tool. Hold a shortcut,
speak, and paste the transcription into the active app. Audio files can also be
dropped into the app and transcribed locally.

## Installation

For people who just want to use Quacky — no code required.

1. **Apple Silicon Macs only.** These builds are for M-series Macs; there is no
   Intel build.
2. **Download** the `.zip` from the
   [latest release](../../releases/latest), unzip it, and drag `Quacky.app`
   into your `/Applications` folder.
3. **First launch — expect a Gatekeeper warning.** macOS will say the app is
   "damaged" or that the developer "cannot be verified." That is expected:
   Quacky is not notarized by Apple. To open it anyway:
   - **Right-click** (or Control-click) `Quacky.app` and choose **Open**, then
     confirm.
   - If macOS still blocks it, go to **System Settings → Privacy & Security**
     and click **Open Anyway**, then launch it again.
   - As a last resort, clear the quarantine flag from Terminal:
     ```bash
     xattr -dr com.apple.quarantine /Applications/Quacky.app
     ```
4. **Grant permissions.** On first launch, allow **Microphone** and
   **Accessibility** when prompted. Without Accessibility, the global shortcut
   does nothing.
5. **First run downloads a speech model.** This takes a few minutes. After that,
   transcription runs fully offline.

This is a personal fork of crwbar voice, which is itself a fork of Handy. The
features it adds on top:

- audio files and voice notes can be dropped onto the recording bar or the
  main window, or picked from _General_;
- a finished transcription can be copied to the clipboard automatically;
- microphone and file transcriptions are easier to distinguish in the history;
- the app has its own bundle identity, icon, tray states, and recording overlay.

The current fork has been built and tested on macOS. It inherits Windows and
Linux build targets from Handy, but those versions have not been verified yet
and should not currently be treated as supported releases.

This project is built on the complete codebase of
[Handy by CJ Pais](https://github.com/cjpais/Handy), by way of
[crwbar voice](https://github.com/CouchTurtle/crwbar-voice). It is a refinement
of that foundation with its own fixes, workflow changes and visual direction,
not an independent rewrite. It uses its own name, bundle identifier, icon and
wordmark, and is affiliated with neither project.

## Current status

The fork runs its own release line, currently `0.4.0`, and is intended for
direct GitHub distribution, not an app store. Automatic updates are
intentionally disabled until this repository has its own signed release channel.

The app currently includes:

- global push-to-talk or toggle-to-talk transcription;
- local Whisper-, Parakeet-, and other compatible speech models;
- audio file transcription, by drag-and-drop or from a file picker, covering
  WAV, MP3, M4A (AAC and Apple Lossless), FLAC, OGG/OGA and OPUS — WhatsApp
  voice notes and iPhone voice memos included;
- long recordings transcribed in pieces, so a talk-length file finishes instead
  of exhausting memory;
- transcription history with microphone/file filters;
- optional automatic clipboard copy and paste;
- shortcuts to reach for the last transcript again: one copies it to the
  clipboard, one types it into the focused field without touching the clipboard;
- a custom accent color for the interface and the recording bar;
- audio ducking that lowers other playback while recording, at a speed you pick;
- optional AI post-processing through a provider configured by the user.

Speech recognition runs locally. AI post-processing is the exception: when it
is explicitly enabled, the transcription is sent to the selected provider.

I may add more optional writing or general tools later, for example, turning a rough
transcription into an email, but that is not part of the current release.

## Develop locally

Requirements: current stable Rust and [Bun](https://bun.sh/).

```bash
bun install
bun run tauri dev
```

Build the frontend or a desktop bundle with:

```bash
bun run build
bun run tauri build
```

Before pushing, `bun run verify` runs the frontend gate (typecheck, lint,
formatting, translation parity, build). The backend tests live in `src-tauri`
and run with `cargo test`.

On macOS, a locally built or unsigned GitHub app may require a one-time
Gatekeeper confirmation and its own microphone/accessibility permissions.
Those permissions belong to `com.jamieandrew.quacky`; existing Handy installations and
their permissions are not changed.

## Data compatibility

On first launch, Quacky can import existing data from the legacy
`com.pais.handy` application-data directory. The original data is left in
place. Large model files are hard-linked when possible to avoid duplicating
several gigabytes; all mutable files use independent copies.

## License and attribution

The application code remains available under the [MIT License](LICENSE).
Quacky forked from [crwbar voice](https://github.com/CouchTurtle/crwbar-voice),
which forked from [Handy](https://github.com/cjpais/Handy) by CJ Pais.
Copyright and contribution history from both remain intact.

The Quacky name, duck mark and wordmark are this fork's own and reuse neither
project's artwork. The duck lives in `src/components/icons/QuackyMark.tsx` and
`src-tauri/icons/app-icon.svg`; the tray icons under `src-tauri/resources/` are
still the inherited ones and are the remaining branding task.
