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
use objc2::{rc::Retained, runtime::AnyClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
    NSAutoresizingMaskOptions, NSGlassEffectView, NSWindow, NSWindowOrderingMode,
};
use objc2_foundation::{NSPoint, NSRect, NSSize};
use std::cell::RefCell;
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

thread_local! {
    /// The glass behind the recording overlay's card. Main thread only.
    static OVERLAY_GLASS: RefCell<Option<Retained<NSGlassEffectView>>> = const { RefCell::new(None) };
}

/// Glass behind the recording overlay's card. The overlay window is larger
/// than the card and the card changes size (pill, Live panel), so the page
/// reports where the card is, in CSS pixels from the top left, and the glass
/// follows it. `opacity` 0 hides it. Older macOS without NSGlassEffectView
/// keeps the card's own CSS surface.
pub fn overlay_card(
    window: &WebviewWindow,
    frame: (f64, f64, f64, f64),
    radius: f64,
    opacity: f64,
) {
    if AnyClass::get(c"NSGlassEffectView").is_none() {
        return;
    }
    let (Some(mtm), Some(ns_window)) = (MainThreadMarker::new(), ns_window(window)) else {
        return;
    };
    let Some(content) = ns_window.contentView() else {
        return;
    };
    let height = content.bounds().size.height;
    let (x, y, w, h) = frame;
    let rect = NSRect::new(NSPoint::new(x, height - y - h), NSSize::new(w, h));
    OVERLAY_GLASS.with(|cell| {
        let mut cell = cell.borrow_mut();
        let glass = cell.get_or_insert_with(|| {
            let glass = NSGlassEffectView::initWithFrame(NSGlassEffectView::alloc(mtm), rect);
            content.addSubview_positioned_relativeTo(&glass, NSWindowOrderingMode::Below, None);
            glass
        });
        glass.setFrame(rect);
        glass.setCornerRadius(radius);
        // A slightly eased alpha: the glass leads the fade-in a touch, but on
        // the way out it reaches zero together with the card, never lingering
        // as an empty pane.
        glass.setAlphaValue(opacity.clamp(0.0, 1.0));
        glass.setHidden(opacity <= 0.01 || w < 1.0 || h < 1.0);
    });
}
