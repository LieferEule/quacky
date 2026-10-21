# handy-keys 0.3.0 – Quacky-Patch

Kopie von handy-keys 0.3.0 (crates.io, MIT) mit einer Änderung in `src/platform/macos/listener.rs`
(Stellen mit `QUACKY PATCH` markiert):

- Tasten bleiben im aktiven Event Tap (Kurzbefehle können geblockt werden).
- Maustasten laufen über einen zweiten Tap mit `ListenOnly`. Maustasten wurden nie geblockt, aber im
  aktiven Tap wartete jeder Klick auf den Tap-Thread. Ein verspätetes Linksklick-Drücken kam nach dem
  Ziehen an, und Ordner auf dem Schreibtisch ließen sich nicht mehr verschieben (2026-10-21).

Upstream-Update: neue Version holen, diese Änderung erneut einbauen oder den Patch in Cargo.toml entfernen,
wenn upstream Maustasten selbst als ListenOnly behandelt.
