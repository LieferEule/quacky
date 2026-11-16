//! Auto-update from the public release feed (LieferEule/quacky-releases).
//!
//! Quacky checks in the background a little after launch and every few hours,
//! only while "check for updates" is on. A newer version is never installed on
//! its own: it shows up as an entry in the duck's menu-bar menu, and a click
//! downloads, verifies (minisign, see `plugins.updater.pubkey`), installs and
//! restarts. Nothing else is sent anywhere.

use std::sync::Mutex;
use std::time::Duration;

use log::{error, info, warn};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::settings;

/// First check this long after launch, so startup stays quick.
const FIRST_CHECK: Duration = Duration::from_secs(30);
/// Then this often.
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// What the tray shows about updates.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpdateState {
    None,
    Available(String),
    Installing(String),
}

static PENDING: Mutex<Option<Update>> = Mutex::new(None);
static STATE: Mutex<UpdateState> = Mutex::new(UpdateState::None);

pub fn state() -> UpdateState {
    STATE.lock().map(|s| s.clone()).unwrap_or(UpdateState::None)
}

fn set_state(app: &AppHandle, state: UpdateState) {
    if let Ok(mut s) = STATE.lock() {
        *s = state;
    }
    crate::tray::update_tray_menu(app, None);
}

/// Start the background checks. Call once from setup.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio_sleep(FIRST_CHECK).await;
        loop {
            if settings::get_settings(&app).update_checks_enabled {
                check(&app).await;
            }
            tokio_sleep(CHECK_EVERY).await;
        }
    });
}

async fn tokio_sleep(d: Duration) {
    tokio::time::sleep(d).await;
}

/// Settings → "Jetzt suchen": check right away and say what came out.
/// `Ok(None)` means up to date.
#[tauri::command]
#[specta::specta]
pub async fn check_update_now(app: AppHandle) -> Result<Option<String>, String> {
    if let UpdateState::Installing(v) = state() {
        return Ok(Some(v));
    }
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    match update {
        Some(update) => {
            let version = update.version.clone();
            if let Ok(mut p) = PENDING.lock() {
                *p = Some(update);
            }
            set_state(&app, UpdateState::Available(version.clone()));
            Ok(Some(version))
        }
        None => {
            if let Ok(mut p) = PENDING.lock() {
                *p = None;
            }
            if state() != UpdateState::None {
                set_state(&app, UpdateState::None);
            }
            Ok(None)
        }
    }
}

/// What the settings row shows when it opens.
#[derive(serde::Serialize, specta::Type)]
pub struct UpdateStatus {
    /// A found update (also while it installs).
    pub version: Option<String>,
    pub installing: bool,
}

#[tauri::command]
#[specta::specta]
pub fn update_status() -> UpdateStatus {
    match state() {
        UpdateState::Available(v) => UpdateStatus {
            version: Some(v),
            installing: false,
        },
        UpdateState::Installing(v) => UpdateStatus {
            version: Some(v),
            installing: true,
        },
        UpdateState::None => UpdateStatus {
            version: None,
            installing: false,
        },
    }
}

/// Settings → "Installieren": same as the tray entry.
#[tauri::command]
#[specta::specta]
pub fn install_update_now(app: AppHandle) -> Result<(), String> {
    // Already started from the duck menu: nothing to do, the UI just waits.
    if matches!(state(), UpdateState::Installing(_)) {
        return Ok(());
    }
    if PENDING.lock().map(|p| p.is_none()).unwrap_or(true) {
        return Err("no update pending".into());
    }
    install(&app);
    Ok(())
}

async fn check(app: &AppHandle) {
    if matches!(state(), UpdateState::Installing(_)) {
        return;
    }
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            warn!("Updater unavailable: {e}");
            return;
        }
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            info!("Update available: {version}");
            if let Ok(mut p) = PENDING.lock() {
                *p = Some(update);
            }
            set_state(app, UpdateState::Available(version));
        }
        Ok(None) => {
            if let Ok(mut p) = PENDING.lock() {
                *p = None;
            }
            if state() != UpdateState::None {
                set_state(app, UpdateState::None);
            }
        }
        // Offline, feed missing, rate limit: try again next round, quietly.
        Err(e) => warn!("Update check failed: {e}"),
    }
}

fn recording(app: &AppHandle) -> bool {
    app.try_state::<Arc<crate::managers::audio::AudioRecordingManager>>()
        .map(|rm| rm.is_recording())
        .unwrap_or(false)
}

/// The tray entry or "Installieren" was clicked: download, install, restart.
/// The restart waits until a running dictation is finished.
pub fn install(app: &AppHandle) {
    let Some(update) = PENDING.lock().ok().and_then(|p| p.clone()) else {
        return;
    };
    if matches!(state(), UpdateState::Installing(_)) {
        return;
    }
    let version = update.version.clone();
    set_state(app, UpdateState::Installing(version.clone()));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match update.download_and_install(|_, _| {}, || {}).await {
            Ok(()) => {
                while recording(&app) {
                    tokio_sleep(Duration::from_millis(500)).await;
                }
                info!("Installed {version}, restarting");
                app.restart();
            }
            Err(e) => {
                error!("Update to {version} failed: {e}");
                // Keep it on offer: the menu entry and the button come back.
                set_state(&app, UpdateState::Available(version.clone()));
                let _ = app.emit("update-failed", version);
            }
        }
    });
}
