//! Audio files handed to Quacky from outside: the Finder's right-click service.
//!
//! The service can be what launches the app, so it may fire before the webview
//! listens. Paths therefore wait here until the frontend takes them, and the
//! `files-opened` event only says "come and get them": whichever of the event
//! and the frontend's check at mount gets there first, nothing is lost.

use std::sync::Mutex;
#[cfg(target_os = "macos")]
use tauri::{AppHandle, Emitter};

static PENDING: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Queue the paths, bring the window up and tell the frontend.
#[cfg(target_os = "macos")]
fn hand_over(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    log::info!("Received {} file(s) from the Finder", paths.len());
    PENDING
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .extend(paths);
    crate::show_main_window(app);
    let _ = app.emit_to("main", "files-opened", ());
}

/// Files waiting for the Files tab; taking them empties the list.
#[tauri::command]
#[specta::specta]
pub fn take_opened_files() -> Vec<String> {
    std::mem::take(&mut *PENDING.lock().unwrap_or_else(|p| p.into_inner()))
}

#[cfg(target_os = "macos")]
pub use service::register;

#[cfg(target_os = "macos")]
mod service {
    use super::hand_over;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, NSObject};
    use objc2::{
        define_class, msg_send, ClassType, DefinedClass, MainThreadMarker, MainThreadOnly,
    };
    use objc2_app_kit::{NSApplication, NSPasteboard, NSUpdateDynamicServices};
    use objc2_foundation::{NSArray, NSObjectProtocol, NSString, NSURL};
    use tauri::AppHandle;

    define_class!(
        // The menu item and file types live in Info.plist (`NSServices`), whose
        // `NSMessage` is this method's name.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "QuackyFinderService"]
        #[ivars = AppHandle]
        struct FinderService;

        unsafe impl NSObjectProtocol for FinderService {}

        impl FinderService {
            #[unsafe(method(transcribeFiles:userData:error:))]
            fn transcribe_files(
                &self,
                pasteboard: &NSPasteboard,
                _user_data: Option<&NSString>,
                _error: *mut *mut NSString,
            ) {
                hand_over(self.ivars(), file_paths(pasteboard));
            }
        }
    );

    fn file_paths(pasteboard: &NSPasteboard) -> Vec<String> {
        let classes: Retained<NSArray<AnyClass>> = NSArray::from_slice(&[NSURL::class()]);
        // SAFETY: the array holds a class that implements NSPasteboardReading.
        let Some(objects) = (unsafe { pasteboard.readObjectsForClasses_options(&classes, None) })
        else {
            return Vec::new();
        };
        objects
            .iter()
            .filter_map(|object| object.downcast::<NSURL>().ok())
            .filter_map(|url| url.path())
            .map(|path| path.to_string())
            .collect()
    }

    /// Make this app answer its `NSServices` entry. Call once, on the main
    /// thread. AppKit does not own the provider, so it lives as long as the app.
    pub fn register(app: &AppHandle) {
        let Some(mtm) = MainThreadMarker::new() else {
            log::warn!("Finder service not registered: not on the main thread");
            return;
        };
        let provider = FinderService::alloc(mtm).set_ivars(app.clone());
        // SAFETY: NSObject's plain init on a freshly allocated subclass.
        let provider: Retained<FinderService> = unsafe { msg_send![super(provider), init] };
        // SAFETY: the provider implements the method named by `NSMessage`.
        unsafe {
            NSApplication::sharedApplication(mtm).setServicesProvider(Some(&provider));
        }
        NSUpdateDynamicServices();
        std::mem::forget(provider);
    }
}
