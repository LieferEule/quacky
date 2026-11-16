use crate::managers::model::ModelManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings;
use crate::tray_i18n::get_tray_translations;
use log::{debug, error, info};
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Emitter, Manager, Theme};

#[cfg(target_os = "macos")]
const WADDLE_FRAME: std::time::Duration = std::time::Duration::from_millis(170);

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TrayIconState {
    Idle,
    Recording,
    Transcribing,
}

/// Tauri managed state holding the last icon state set via `change_tray_icon`.
pub struct CurrentTrayIconState(pub Mutex<TrayIconState>);

impl CurrentTrayIconState {
    pub fn new() -> Self {
        Self(Mutex::new(TrayIconState::Idle))
    }

    pub fn get(&self) -> TrayIconState {
        *self.0.lock().unwrap()
    }

    fn set(&self, state: TrayIconState) {
        *self.0.lock().unwrap() = state;
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum AppTheme {
    Dark,
    Light,
    Colored, // Branded/colored theme for Linux
}

/// Gets the current app theme, with Linux defaulting to Colored theme
pub fn get_current_theme(app: &AppHandle) -> AppTheme {
    if cfg!(target_os = "linux") {
        // On Linux, always use the colored theme
        AppTheme::Colored
    } else {
        // On Windows the tray icon sits on the taskbar, which follows the
        // *system* theme (SystemUsesLightTheme), not the app theme. With the
        // "Custom" personalization mode the two can differ (e.g. dark taskbar
        // + light apps), and the window theme would pick an icon that is
        // invisible against the taskbar.
        #[cfg(target_os = "windows")]
        if let Some(theme) = windows_taskbar_theme() {
            return theme;
        }

        // On other platforms, map system theme to our app theme
        if let Some(main_window) = app.get_webview_window("main") {
            match main_window.theme().unwrap_or(Theme::Dark) {
                Theme::Light => AppTheme::Light,
                Theme::Dark => AppTheme::Dark,
                _ => AppTheme::Dark, // Default fallback
            }
        } else {
            AppTheme::Dark
        }
    }
}

/// Reads the Windows taskbar theme from the registry.
///
/// Returns None if the value is missing (older Windows 10 builds default to a
/// dark taskbar there, but falling back to the window theme is safer than
/// guessing).
#[cfg(target_os = "windows")]
fn windows_taskbar_theme() -> Option<AppTheme> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let personalize = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        .ok()?;
    let system_uses_light: u32 = personalize.get_value("SystemUsesLightTheme").ok()?;
    Some(if system_uses_light == 1 {
        AppTheme::Light
    } else {
        AppTheme::Dark
    })
}

/// Gets the appropriate icon path for the given theme and state
pub fn get_icon_path(theme: AppTheme, state: TrayIconState) -> &'static str {
    match (theme, state) {
        // Dark theme uses light icons
        (AppTheme::Dark, TrayIconState::Idle) => "resources/tray_idle.png",
        (AppTheme::Dark, TrayIconState::Recording) => "resources/tray_recording.png",
        (AppTheme::Dark, TrayIconState::Transcribing) => "resources/tray_transcribing.png",
        // Light theme uses dark icons
        (AppTheme::Light, TrayIconState::Idle) => "resources/tray_idle_dark.png",
        (AppTheme::Light, TrayIconState::Recording) => "resources/tray_recording_dark.png",
        (AppTheme::Light, TrayIconState::Transcribing) => "resources/tray_transcribing_dark.png",
        // Linux also uses the neutral monochrome set; desktop panels tint or
        // contrast template icons differently, so brand color is kept in-app.
        (AppTheme::Colored, TrayIconState::Idle) => "resources/tray_idle.png",
        (AppTheme::Colored, TrayIconState::Recording) => "resources/tray_recording.png",
        (AppTheme::Colored, TrayIconState::Transcribing) => "resources/tray_transcribing.png",
    }
}

pub fn change_tray_icon(app: &AppHandle, icon: TrayIconState) {
    let tray = app.state::<TrayIcon>();
    let theme = get_current_theme(app);

    // Store current state
    app.state::<CurrentTrayIconState>().set(icon);

    // The main window mirrors it (the duck on Dictate). The tray follows every
    // dictation, while the overlay stays silent whenever Puddle owns the UI.
    let state = match icon {
        TrayIconState::Idle => "idle",
        TrayIconState::Recording => "recording",
        TrayIconState::Transcribing => "transcribing",
    };
    let _ = app.emit_to("main", "recording-state", state);

    #[cfg(target_os = "macos")]
    if icon == TrayIconState::Recording {
        start_waddle(app);
    }

    let icon_path = get_icon_path(theme, icon);

    let icon_started = std::time::Instant::now();
    if let Err(err) = load_tray_icon(
        app.path()
            .resolve(icon_path, tauri::path::BaseDirectory::Resource),
    )
    .and_then(|image| tray.set_icon(Some(image)))
    {
        error!("Failed to update tray icon '{icon_path}': {err}");
    }
    let icon_elapsed = icon_started.elapsed();

    // Update menu based on state
    let menu_started = std::time::Instant::now();
    update_tray_menu(app, None);
    debug!(
        "tray icon change ({:?}): icon={} set_icon={:?} menu={:?}",
        icon,
        icon_path,
        icon_elapsed,
        menu_started.elapsed()
    );
}

/// While recording, the menu-bar duck waddles through its frames. The thread
/// ends by itself once the state moves on, and repaints that state on its way
/// out, because its last frame can land just after `change_tray_icon` set the
/// final icon.
#[cfg(target_os = "macos")]
fn start_waddle(app: &AppHandle) {
    static RUNNING: AtomicBool = AtomicBool::new(false);
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        // Template images, so only their alpha matters: one set serves both
        // themes. Lean left, stand, lean right, stand.
        let frames: Vec<Image<'static>> = [
            "tray_waddle_left",
            "tray_recording",
            "tray_waddle_right",
            "tray_recording",
        ]
        .iter()
        .filter_map(|name| {
            let path = format!("resources/{name}.png");
            load_tray_icon(
                app.path()
                    .resolve(path, tauri::path::BaseDirectory::Resource),
            )
            .ok()
        })
        .collect();
        let recording = || app.state::<CurrentTrayIconState>().get() == TrayIconState::Recording;
        let tray = app.state::<TrayIcon>();
        for frame in frames.iter().cycle() {
            if !recording() {
                break;
            }
            let _ = tray.set_icon_with_as_template(Some(frame.clone()), true);
            std::thread::sleep(WADDLE_FRAME);
        }
        RUNNING.store(false, Ordering::SeqCst);
        // Also restarts the waddle if recording began again just as this ended.
        refresh_tray_icon(&app);
    });
}

/// Re-applies the last known tray state — for when only the *theme* changed
/// and the state itself (idle/recording/transcribing) should be preserved.
pub fn refresh_tray_icon(app: &AppHandle) {
    let icon = app.state::<CurrentTrayIconState>().get();
    change_tray_icon(app, icon);
}

fn load_tray_icon(resolved_icon_path: tauri::Result<PathBuf>) -> tauri::Result<Image<'static>> {
    let resolved_icon_path = resolved_icon_path?;
    Image::from_path(&resolved_icon_path).map(Image::to_owned)
}

pub fn tray_tooltip() -> String {
    version_label()
}

fn version_label() -> String {
    if cfg!(debug_assertions) {
        format!("Quacky v{} (Dev)", env!("CARGO_PKG_VERSION"))
    } else {
        format!("Quacky v{}", env!("CARGO_PKG_VERSION"))
    }
}

pub fn update_tray_menu(app: &AppHandle, locale: Option<&str>) {
    let state = app.state::<CurrentTrayIconState>().get();
    let settings = settings::get_settings(app);

    let locale = locale.unwrap_or(&settings.app_language);
    let strings = get_tray_translations(Some(locale.to_string()));

    // Platform-specific accelerators
    #[cfg(target_os = "macos")]
    let (settings_accelerator, quit_accelerator) = (Some("Cmd+,"), Some("Cmd+Q"));
    #[cfg(not(target_os = "macos"))]
    let (settings_accelerator, quit_accelerator) = (Some("Ctrl+,"), Some("Ctrl+Q"));

    // Create common menu items
    let version_label = version_label();
    let version_i = MenuItem::with_id(app, "version", &version_label, false, None::<&str>)
        .expect("failed to create version item");
    let settings_i = MenuItem::with_id(
        app,
        "settings",
        &strings.settings,
        true,
        settings_accelerator,
    )
    .expect("failed to create settings item");
    let copy_last_transcript_i = MenuItem::with_id(
        app,
        "copy_last_transcript",
        &strings.copy_last_transcript,
        true,
        None::<&str>,
    )
    .expect("failed to create copy last transcript item");
    let model_loaded = app.state::<Arc<TranscriptionManager>>().is_model_loaded();
    let quit_i = MenuItem::with_id(app, "quit", &strings.quit, true, quit_accelerator)
        .expect("failed to create quit item");
    let separator = || PredefinedMenuItem::separator(app).expect("failed to create separator");

    // Build model submenu — label is the active model name
    let model_manager = app.state::<Arc<ModelManager>>();
    let models = model_manager.get_available_models();
    let current_model_id = &settings.selected_model;

    let mut downloaded: Vec<_> = models.into_iter().filter(|m| m.is_downloaded).collect();
    downloaded.sort_by(|a, b| a.name.cmp(&b.name));

    let submenu_label = downloaded
        .iter()
        .find(|m| m.id == *current_model_id)
        .map(|m| m.name.clone())
        .unwrap_or_else(|| strings.model.clone());

    let model_submenu = {
        let submenu = Submenu::with_id(app, "model_submenu", &submenu_label, true)
            .expect("failed to create model submenu");

        for model in &downloaded {
            let is_active = model.id == *current_model_id;
            let item_id = format!("model_select:{}", model.id);
            let item =
                CheckMenuItem::with_id(app, &item_id, &model.name, true, is_active, None::<&str>)
                    .expect("failed to create model item");
            let _ = submenu.append(&item);
        }

        submenu
    };

    let unload_model_i = MenuItem::with_id(
        app,
        "unload_model",
        &strings.unload_model,
        model_loaded,
        None::<&str>,
    )
    .expect("failed to create unload model item");

    // A found update sits at the top of the menu until it is installed.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let update_i = match crate::updates::state() {
        crate::updates::UpdateState::None => None,
        crate::updates::UpdateState::Available(v) => Some(
            MenuItem::with_id(
                app,
                "install_update",
                strings.install_update.replace("{version}", &v),
                true,
                None::<&str>,
            )
            .expect("failed to create update item"),
        ),
        crate::updates::UpdateState::Installing(v) => Some(
            MenuItem::with_id(
                app,
                "install_update",
                strings.installing_update.replace("{version}", &v),
                false,
                None::<&str>,
            )
            .expect("failed to create update item"),
        ),
    };
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let update_i: Option<MenuItem<tauri::Wry>> = None;

    let menu = match state {
        TrayIconState::Recording | TrayIconState::Transcribing => {
            let cancel_i = MenuItem::with_id(app, "cancel", &strings.cancel, true, None::<&str>)
                .expect("failed to create cancel item");
            Menu::with_items(
                app,
                &[
                    &version_i,
                    &separator(),
                    &cancel_i,
                    &separator(),
                    &copy_last_transcript_i,
                    &separator(),
                    &settings_i,
                    &separator(),
                    &quit_i,
                ],
            )
            .expect("failed to create menu")
        }
        TrayIconState::Idle => {
            let menu = Menu::with_items(
                app,
                &[
                    &version_i,
                    &separator(),
                    &copy_last_transcript_i,
                    &separator(),
                    &model_submenu,
                    &unload_model_i,
                    &separator(),
                    &settings_i,
                    &separator(),
                    &quit_i,
                ],
            )
            .expect("failed to create menu");
            if let Some(item) = &update_i {
                let _ = menu.insert(item, 1);
                let _ = menu.insert(&separator(), 1);
            }
            menu
        }
    };

    let tray = app.state::<TrayIcon>();
    let _ = tray.set_menu(Some(menu));
    let _ = tray.set_icon_as_template(true);
    let _ = tray.set_tooltip(Some(version_label));
}

pub fn set_tray_visibility(app: &AppHandle, visible: bool) {
    let tray = app.state::<TrayIcon>();
    if let Err(e) = tray.set_visible(visible) {
        error!("Failed to set tray visibility: {}", e);
    } else {
        info!("Tray visibility set to: {}", visible);
    }
}

pub fn copy_last_transcript(app: &AppHandle) {
    crate::last_transcript::copy_to_clipboard(app);
}

#[cfg(test)]
mod tests {
    use super::load_tray_icon;

    #[test]
    fn tray_icon_resolution_failure_is_returned_instead_of_panicking() {
        assert!(load_tray_icon(Err(tauri::Error::UnknownPath)).is_err());
    }

    #[test]
    fn tray_icon_returns_err_when_file_does_not_exist() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let missing = dir.path().join("does_not_exist.png");
        assert!(load_tray_icon(Ok(missing)).is_err());
    }
}
