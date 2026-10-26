//! Bridge to notch-toolkit, Jamie's notch app on macOS.
//!
//! While the notch app runs, it owns the recording UI: Quacky reports its
//! overlay states, mic levels, live text and finished transcripts over a Unix
//! socket instead of showing its own overlay. The notch can send back two
//! requests: transcribe an audio file dropped onto the notch, and cancel.
//!
//! Wire format: one JSON object per line, both directions. Without the notch
//! app nothing connects and Quacky behaves exactly as before.

use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::AppHandle;

static ACTIVE: AtomicBool = AtomicBool::new(false);
static LAST_LEVEL_SEND: AtomicU64 = AtomicU64::new(0);
/// Levels at ~30 fps are plenty for the notch's bars.
const LEVEL_THROTTLE_MS: u64 = 33;

/// True while the notch app is connected: Quacky's own overlay stays hidden.
pub fn active() -> bool {
    ACTIVE.load(Ordering::Relaxed)
}

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::UnixStream;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::Duration;

    static WRITER: Mutex<Option<UnixStream>> = Mutex::new(None);

    fn socket_path() -> Option<PathBuf> {
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home).join("Library/Application Support/NotchToolkit/quacky.sock")
        })
    }

    /// Connects in the background and keeps reconnecting (every 2 s) while the
    /// notch app is not running. Reading happens on the same thread.
    pub fn start(app: AppHandle) {
        std::thread::Builder::new()
            .name("notch-bridge".into())
            .spawn(move || loop {
                if let Some(path) = socket_path() {
                    if let Ok(stream) = UnixStream::connect(&path) {
                        let _ = stream.set_write_timeout(Some(Duration::from_millis(100)));
                        if let Ok(writer) = stream.try_clone() {
                            *WRITER.lock().unwrap_or_else(|p| p.into_inner()) = Some(writer);
                            ACTIVE.store(true, Ordering::Relaxed);
                            log::info!("notch: connected");
                            let handle = app.clone();
                            let _ = app.run_on_main_thread(move || {
                                crate::overlay::hide_own_overlay_window(&handle);
                            });
                            send(json!({ "type": "hello", "app": "quacky", "v": 1 }));
                            read_requests(&app, stream);
                            ACTIVE.store(false, Ordering::Relaxed);
                            *WRITER.lock().unwrap_or_else(|p| p.into_inner()) = None;
                            log::info!("notch: disconnected");
                        }
                    }
                }
                std::thread::sleep(Duration::from_secs(2));
            })
            .ok();
    }

    fn read_requests(app: &AppHandle, stream: UnixStream) {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let Ok(request) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            match request["type"].as_str() {
                Some("transcribe_file") => {
                    if let Some(path) = request["path"].as_str() {
                        transcribe_file(app.clone(), path.to_string());
                    }
                }
                Some("cancel") => crate::commands::cancel_operation(app.clone()),
                _ => {}
            }
        }
    }

    /// A file dropped onto the notch: transcribed without pasting anywhere
    /// (`deliver: false`); the notch puts the text on the clipboard itself.
    fn transcribe_file(app: AppHandle, path: String) {
        let name = std::path::Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        send(json!({ "type": "file_started", "name": name }));
        tauri::async_runtime::spawn(async move {
            match crate::commands::transcription::transcribe_file(app, path, false).await {
                Ok(result) => send(json!({
                    "type": "file_done",
                    "name": name,
                    "text": result.text,
                    "complete": result.complete,
                })),
                Err(error) => send(json!({ "type": "file_error", "name": name, "message": error })),
            }
        });
    }

    pub fn send(message: Value) {
        let mut guard = WRITER.lock().unwrap_or_else(|p| p.into_inner());
        let Some(stream) = guard.as_mut() else { return };
        let mut line = message.to_string();
        line.push('\n');
        if stream.write_all(line.as_bytes()).is_err() {
            // The reader thread notices the closed socket and reconnects.
            *guard = None;
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::*;
    pub fn start(_app: AppHandle) {}
    pub fn send(_message: Value) {}
}

pub use imp::start;

fn send(message: Value) {
    if active() {
        imp::send(message);
    }
}

/// An overlay state: recording, streaming, transcribing, processing, done.
pub fn state(state: &str, mode: &str) {
    send(json!({ "type": "state", "state": state, "mode": mode }));
}

pub fn hide() {
    send(json!({ "type": "hide" }));
}

pub fn hands_free(on: bool) {
    send(json!({ "type": "hands_free", "on": on }));
}

pub fn levels(levels: &[f32]) {
    if !active() {
        return;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    if now.saturating_sub(LAST_LEVEL_SEND.load(Ordering::Relaxed)) < LEVEL_THROTTLE_MS {
        return;
    }
    LAST_LEVEL_SEND.store(now, Ordering::Relaxed);
    send(json!({ "type": "levels", "levels": levels }));
}

/// Live text while streaming: what is settled and what may still change.
pub fn stream_text(committed: &str, tentative: &str) {
    send(json!({ "type": "stream_text", "committed": committed, "tentative": tentative }));
}

/// The finished dictation and whether pasting it worked (otherwise it is only on the clipboard).
pub fn done(text: &str, pasted: bool) {
    send(json!({ "type": "done", "text": text, "pasted": pasted }));
}
