---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/Sidebar.tsx"]
---

# Main window

Mode: Operate. A macOS settings and file-transcription window. People open it from the menu-bar duck, do one thing (transcribe a file or change a setting) and close it again.

## Direction contract

THESIS: Quacky talks. The window is Liquid Glass with a fine, macOS-26-precise frame (Feder), and every settings group is a question the duck asks, answered inside its speech bubble (Schnatter). It refuses the inherited sidebar with its grey stack of tiled rows.

OWN-WORLD: System glass ground. A centred glass tab bar whose lens glides. Translucent bubbles with a white rim, radius 18 with a 6px tail corner, and a small duck avatar beside each. Rows of 13px, with the description in 11.5px under the label instead of an info icon. Choices with few options are answer chips (capsules, the chosen one in accent fill). SF system type. The accent (Quacky orange by default, user-changeable) marks selection, chosen answers, switches and the quack meter.

STORY: The visitor sees at once whether Quacky is ready (status, shortcut, model, live mic level). They read the settings as a short conversation, change a thing in one click, and leave.

FIRST VIEWPORT: The traffic lights sit at top left and the glass tabs are centred at the top (Dictate, Files, History, Models, AI, App, About). Dictate opens with the hero row: the duck, "Ready to quack", the shortcut kbd plus the model, and the quack meter on the right. Below come the duck's questions: "How do you want to call me?", "Which ear should I listen with?", "And where does the text go?".

FORM: Mockup D, chosen by the user from A Teich / B Schnatter / C Feder (D = C's frame + B's conversation). Signature move: the duck speaks. Each group is a bubble that settles in in sequence, the tab lens glides on a spring, and the quack meter moves with the real mic level. seed: none (direction pinned by the brief)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
