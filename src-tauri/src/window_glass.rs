//! System glass behind the main window on macOS.
//!
//! The main window is transparent and an `NSGlassEffectView` sits behind the
//! webview, so the web UI draws on real Liquid Glass, the same material
//! Puddle's settings window uses. macOS before 26 has no such class and gets
//! the older vibrancy material instead.
//!
//! Glass follows the window's appearance, not the page's, so the `theme`
//! setting has to reach the window too, or a forced light theme would sit on
//! dark glass. Tauri's `set_theme` would do it app-wide and also flip the
//! overlay, hence the per-window `setAppearance`.

use crate::settings::Theme;
use objc2::{runtime::AnyClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
    NSAutoresizingMaskOptions, NSGlassEffectView, NSWindow, NSWindowOrderingMode,
};
use tauri::window::{Effect, EffectState, EffectsBuilder};
use tauri::WebviewWindow;

pub fn apply(window: &WebviewWindow) {
    if AnyClass::get(c"NSGlassEffectView").is_none() {
        let effects = EffectsBuilder::new()
            .effect(Effect::UnderWindowBackground)
            .state(EffectState::FollowsWindowActiveState)
            .build();
        if let Err(e) = window.set_effects(effects) {
            log::warn!("Failed to apply window vibrancy: {}", e);
        }
        return;
    }
    let Some(ns_window) = ns_window(window) else {
        return;
    };
    let (Some(mtm), Some(content)) = (MainThreadMarker::new(), ns_window.contentView()) else {
        return;
    };
    let glass = NSGlassEffectView::initWithFrame(NSGlassEffectView::alloc(mtm), content.bounds());
    glass.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    content.addSubview_positioned_relativeTo(&glass, NSWindowOrderingMode::Below, None);
}

/// Must run on the main thread (AppKit); `change_theme_setting` is a sync
/// command, which Tauri runs there. Off it, this does nothing.
pub fn set_theme(window: &WebviewWindow, theme: Theme) {
    let (Some(_), Some(ns_window)) = (MainThreadMarker::new(), ns_window(window)) else {
        return;
    };
    let appearance = match theme {
        Theme::System => None,
        Theme::Light => NSAppearance::appearanceNamed(unsafe { NSAppearanceNameAqua }),
        Theme::Dark => NSAppearance::appearanceNamed(unsafe { NSAppearanceNameDarkAqua }),
    };
    ns_window.setAppearance(appearance.as_deref());
}

fn ns_window(window: &WebviewWindow) -> Option<&NSWindow> {
    // SAFETY: Tauri hands out the live NSWindow of a window it still owns.
    // Callers touch it only on the main thread (both check MainThreadMarker).
    window
        .ns_window()
        .ok()
        .map(|ptr| unsafe { &*(ptr as *const NSWindow) })
}
