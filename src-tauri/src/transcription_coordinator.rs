use crate::actions::ACTION_MAP;
use crate::managers::audio::AudioRecordingManager;
use log::{debug, error, warn};
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const DEBOUNCE: Duration = Duration::from_millis(30);
const RELEASE_GRACE: Duration = Duration::from_millis(50);

/// Longest hold that still counts as a *tap* rather than a push-to-talk press.
/// A tap is the building block of the double-tap that latches hands-free mode.
const TAP_MAX_HOLD: Duration = Duration::from_millis(300);

/// Shortest gap between a tap's release and the next press for that press to
/// count as a deliberate second tap. Anything faster is keyboard auto-repeat or
/// contact bounce, where the key was never actually let go (see #1539), and is
/// treated as a continued hold instead of a latch.
///
/// This is the only separator available, and it is not a complete one: on X11 a
/// repeat delay inside `TAP_MAX_HOLD` combined with a repeat interval past this
/// gap produces exactly the event sequence of a double tap. That is why
/// `settings::default_double_tap_latch` leaves the feature off on Linux.
const MIN_TAP_GAP: Duration = Duration::from_millis(60);

/// How the coordinator should treat push-to-talk input for one event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PttConfig {
    /// Hold-to-record. When false the binding is a plain toggle and none of the
    /// double-tap handling applies.
    pub push_to_talk: bool,
    /// Let a double tap latch the recording so it runs hands-free.
    pub double_tap_latch: bool,
    /// How long after a tap a second tap still latches.
    pub double_tap_window: Duration,
}

impl PttConfig {
    /// Plain toggle semantics, used for signal- and tray-driven input where
    /// there is no key to hold.
    pub fn toggle() -> Self {
        Self {
            push_to_talk: false,
            double_tap_latch: false,
            double_tap_window: Duration::ZERO,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PttAction {
    Passthrough,
    /// Swallow the event entirely.
    Ignore,
    /// A hold was released: wait out `RELEASE_GRACE` to absorb auto-repeat.
    DeferRelease,
    /// A tap was released: wait out the double-tap window before stopping.
    DeferTapRelease,
    /// Auto-repeat press arrived: the key is still down, keep recording.
    CancelRelease,
    /// Second tap inside the window: keep recording hands-free.
    Latch,
    /// Press while latched: finish the hands-free recording.
    StopLatched,
}

/// Why a release is being held back, which decides how long it waits and what a
/// press arriving in the meantime means.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PendingKind {
    /// Auto-repeat guard after a hold.
    Grace,
    /// Double-tap window after a tap.
    TapWindow,
}

struct PendingRelease {
    binding_id: String,
    hotkey_string: String,
    kind: PendingKind,
    released_at: Instant,
    deadline: Instant,
    /// The recording this release belongs to, identified by its start instant.
    /// A held-back release must never stop a *later* recording that happens to
    /// use the same binding.
    for_recording: Option<Instant>,
}

/// Everything `classify_ptt_event` needs about one input event and the state
/// around it.
#[derive(Debug, Clone, Copy)]
struct PttEvent<'a> {
    binding_id: &'a str,
    is_pressed: bool,
    config: PttConfig,
    /// Recording is running hands-free after a double tap.
    latched: bool,
    /// Binding of a held-back release, its kind, and how long ago it happened.
    pending: Option<(&'a str, PendingKind, Duration)>,
    recording_binding: Option<&'a str>,
    /// On a release: how long the key that started this recording was down.
    held_for: Option<Duration>,
    /// This recording has already produced a keyboard auto-repeat, so the key
    /// is being held down and no release from it can be part of a tap.
    saw_autorepeat: bool,
}

/// Commands processed sequentially by the coordinator thread.
enum Command {
    Input {
        binding_id: String,
        hotkey_string: String,
        is_pressed: bool,
        config: PttConfig,
    },
    Cancel {
        recording_was_active: bool,
    },
    ProcessingFinished,
}

/// Pipeline lifecycle, owned exclusively by the coordinator thread.
enum Stage {
    Idle,
    Recording(String), // binding_id
    Processing,
}

fn classify_ptt_event(ev: PttEvent) -> PttAction {
    if !ev.config.push_to_talk {
        return PttAction::Passthrough;
    }

    if ev.is_pressed {
        // A press ends a hands-free recording, whatever else is going on.
        if ev.latched && ev.recording_binding == Some(ev.binding_id) {
            return PttAction::StopLatched;
        }

        match ev.pending {
            // Latching requires a recording to actually be running. Without this
            // guard a pending tap window that outlives its recording (the
            // pipeline finishing early, say) would latch an idle app.
            Some((id, PendingKind::TapWindow, since_release))
                if id == ev.binding_id && ev.recording_binding == Some(ev.binding_id) =>
            {
                if since_release >= MIN_TAP_GAP {
                    PttAction::Latch
                } else {
                    // Too fast to be a second tap: auto-repeat, not a double tap.
                    PttAction::CancelRelease
                }
            }
            Some((id, PendingKind::Grace, _)) if id == ev.binding_id => PttAction::CancelRelease,
            _ => PttAction::Passthrough,
        }
    } else {
        // Hands-free recording ignores key-up entirely — that is the point.
        if ev.latched {
            return PttAction::Ignore;
        }

        if ev.recording_binding == Some(ev.binding_id) && ev.pending.is_none() {
            // `saw_autorepeat` narrows the X11 exposure: once a recording has
            // seen one auto-repeat the key is demonstrably down, so no later
            // release from it can be a tap. It does not close the hole, because
            // the *first* synthesized release still looks like one — see
            // `MIN_TAP_GAP` and the Linux default.
            let was_tap = !ev.saw_autorepeat
                && ev.config.double_tap_latch
                && ev.held_for.is_some_and(|held| held <= TAP_MAX_HOLD);
            if was_tap {
                PttAction::DeferTapRelease
            } else {
                PttAction::DeferRelease
            }
        } else {
            PttAction::Passthrough
        }
    }
}

/// Serialises all transcription lifecycle events through a single thread
/// to eliminate race conditions between keyboard shortcuts, signals, and
/// the async transcribe-paste pipeline.
pub struct TranscriptionCoordinator {
    tx: Sender<Command>,
}

pub fn is_transcribe_binding(id: &str) -> bool {
    matches!(
        id,
        "transcribe" | "transcribe_with_post_process" | "voice_action"
    )
}

impl TranscriptionCoordinator {
    pub fn new(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel();

        thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut stage = Stage::Idle;
                let mut last_press: Option<Instant> = None;
                let mut pending_release: Option<PendingRelease> = None;
                // Recording is running hands-free after a double tap.
                let mut latched = false;
                // When the current recording's key went down, so a release can
                // be classified as a tap or a hold.
                let mut recording_started_at: Option<Instant> = None;
                // Set once this recording has seen keyboard auto-repeat, which
                // proves the key is being held rather than tapped.
                let mut saw_autorepeat = false;

                loop {
                    let cmd = if let Some(pending) = &pending_release {
                        match rx.recv_timeout(
                            pending.deadline.saturating_duration_since(Instant::now()),
                        ) {
                            Ok(cmd) => cmd,
                            Err(mpsc::RecvTimeoutError::Timeout) => {
                                if let Some(pending) = pending_release.take() {
                                    if pending.for_recording == recording_started_at
                                        && matches!(&stage, Stage::Recording(id) if id == &pending.binding_id)
                                    {
                                        stop(
                                            &app,
                                            &mut stage,
                                            &pending.binding_id,
                                            &pending.hotkey_string,
                                        );
                                        recording_started_at = None;
                                        saw_autorepeat = false;
                                    }
                                }
                                continue;
                            }
                            Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        }
                    } else {
                        match rx.recv() {
                            Ok(cmd) => cmd,
                            Err(_) => break,
                        }
                    };

                    match cmd {
                        Command::Input {
                            binding_id,
                            hotkey_string,
                            is_pressed,
                            config,
                        } => {
                            let now = Instant::now();
                            let pending_info =
                                pending_release.as_ref().map(|pending| {
                                    (
                                        pending.binding_id.as_str(),
                                        pending.kind,
                                        now.saturating_duration_since(pending.released_at),
                                    )
                                });
                            let recording_binding = match &stage {
                                Stage::Recording(id) => Some(id.as_str()),
                                _ => None,
                            };

                            let action = classify_ptt_event(PttEvent {
                                binding_id: &binding_id,
                                is_pressed,
                                config,
                                latched,
                                pending: pending_info,
                                recording_binding,
                                held_for: recording_started_at
                                    .map(|started| now.saturating_duration_since(started)),
                                saw_autorepeat,
                            });

                            match action {
                                PttAction::Ignore => continue,
                                PttAction::CancelRelease => {
                                    pending_release = None;
                                    // Only auto-repeat produces a press that
                                    // cancels its own release, so this is the
                                    // one place that proves the key is held.
                                    saw_autorepeat = true;
                                    continue;
                                }
                                PttAction::DeferRelease => {
                                    pending_release = Some(PendingRelease {
                                        binding_id,
                                        hotkey_string,
                                        kind: PendingKind::Grace,
                                        released_at: now,
                                        deadline: now + RELEASE_GRACE,
                                        for_recording: recording_started_at,
                                    });
                                    continue;
                                }
                                PttAction::DeferTapRelease => {
                                    pending_release = Some(PendingRelease {
                                        binding_id,
                                        hotkey_string,
                                        kind: PendingKind::TapWindow,
                                        released_at: now,
                                        deadline: now + config.double_tap_window,
                                        for_recording: recording_started_at,
                                    });
                                    continue;
                                }
                                PttAction::Latch => {
                                    pending_release = None;
                                    latched = true;
                                    last_press = Some(now);
                                    debug!("Hands-free recording latched for '{binding_id}'");
                                    // Nothing else changes on screen at this
                                    // moment, so repeat the start cue: two pops
                                    // mean "it stays on now".
                                    crate::audio_feedback::play_feedback_sound(
                                        &app,
                                        crate::audio_feedback::SoundType::Start,
                                    );
                                    crate::overlay::set_overlay_hands_free(&app, true);
                                    continue;
                                }
                                PttAction::StopLatched => {
                                    // Guard against contact bounce on the closing tap.
                                    if last_press
                                        .is_some_and(|t| now.duration_since(t) < DEBOUNCE)
                                    {
                                        debug!("Debounced latch-stop for '{binding_id}'");
                                        continue;
                                    }
                                    last_press = Some(now);
                                    latched = false;
                                    recording_started_at = None;
                                    saw_autorepeat = false;
                                    crate::overlay::set_overlay_hands_free(&app, false);
                                    stop(&app, &mut stage, &binding_id, &hotkey_string);
                                    continue;
                                }
                                PttAction::Passthrough => {}
                            }

                            // Debounce rapid-fire press events (key repeat / double-tap).
                            // Push-to-talk releases may be deferred above to absorb X11 auto-repeat.
                            if is_pressed {
                                if last_press.is_some_and(|t| now.duration_since(t) < DEBOUNCE) {
                                    debug!("Debounced press for '{binding_id}'");
                                    continue;
                                }
                                last_press = Some(now);
                            }

                            if config.push_to_talk {
                                if is_pressed && matches!(stage, Stage::Idle) {
                                    start(&app, &mut stage, &binding_id, &hotkey_string);
                                    recording_started_at =
                                        matches!(stage, Stage::Recording(_)).then_some(now);
                                    saw_autorepeat = false;
                                } else if !is_pressed
                                    && matches!(&stage, Stage::Recording(id) if id == &binding_id)
                                {
                                    stop(&app, &mut stage, &binding_id, &hotkey_string);
                                    recording_started_at = None;
                                    saw_autorepeat = false;
                                }
                            } else if is_pressed {
                                match &stage {
                                    Stage::Idle => {
                                        start(&app, &mut stage, &binding_id, &hotkey_string);
                                    }
                                    Stage::Recording(id) if id == &binding_id => {
                                        stop(&app, &mut stage, &binding_id, &hotkey_string);
                                    }
                                    _ => {
                                        debug!("Ignoring press for '{binding_id}': pipeline busy")
                                    }
                                }
                            }
                        }
                        Command::Cancel {
                            recording_was_active,
                        } => {
                            pending_release = None;
                            latched = false;
                            recording_started_at = None;
                            saw_autorepeat = false;
                            crate::overlay::set_overlay_hands_free(&app, false);
                            // Don't reset during processing — wait for the pipeline to finish.
                            if !matches!(stage, Stage::Processing)
                                && (recording_was_active || matches!(stage, Stage::Recording(_)))
                            {
                                stage = Stage::Idle;
                            }
                        }
                        Command::ProcessingFinished => {
                            stage = Stage::Idle;
                            latched = false;
                            recording_started_at = None;
                            saw_autorepeat = false;
                            // A tap window must never outlive the recording it
                            // belongs to, or the next press would latch an idle
                            // app.
                            pending_release = None;
                            crate::overlay::set_overlay_hands_free(&app, false);
                        }
                    }
                }
                debug!("Transcription coordinator exited");
            }));
            if let Err(e) = result {
                error!("Transcription coordinator panicked: {e:?}");
            }
        });

        Self { tx }
    }

    /// Send a keyboard/signal input event for a transcribe binding.
    /// For signal-based toggles, use `is_pressed: true` and `PttConfig::toggle()`.
    pub fn send_input(
        &self,
        binding_id: &str,
        hotkey_string: &str,
        is_pressed: bool,
        config: PttConfig,
    ) {
        if self
            .tx
            .send(Command::Input {
                binding_id: binding_id.to_string(),
                hotkey_string: hotkey_string.to_string(),
                is_pressed,
                config,
            })
            .is_err()
        {
            warn!("Transcription coordinator channel closed");
        }
    }

    pub fn notify_cancel(&self, recording_was_active: bool) {
        if self
            .tx
            .send(Command::Cancel {
                recording_was_active,
            })
            .is_err()
        {
            warn!("Transcription coordinator channel closed");
        }
    }

    pub fn notify_processing_finished(&self) {
        if self.tx.send(Command::ProcessingFinished).is_err() {
            warn!("Transcription coordinator channel closed");
        }
    }
}

fn start(app: &AppHandle, stage: &mut Stage, binding_id: &str, hotkey_string: &str) {
    let Some(action) = ACTION_MAP.get(binding_id) else {
        warn!("No action in ACTION_MAP for '{binding_id}'");
        return;
    };
    action.start(app, binding_id, hotkey_string);
    if app
        .try_state::<Arc<AudioRecordingManager>>()
        .is_some_and(|a| a.is_recording())
    {
        *stage = Stage::Recording(binding_id.to_string());
    } else {
        debug!("Start for '{binding_id}' did not begin recording; staying idle");
    }
}

fn stop(app: &AppHandle, stage: &mut Stage, binding_id: &str, hotkey_string: &str) {
    let Some(action) = ACTION_MAP.get(binding_id) else {
        warn!("No action in ACTION_MAP for '{binding_id}'");
        return;
    };
    action.stop(app, binding_id, hotkey_string);
    *stage = Stage::Processing;
}

#[cfg(test)]
mod tests {
    use super::*;

    const BINDING: &str = "transcribe";
    const WINDOW: Duration = Duration::from_millis(350);

    fn ptt() -> PttConfig {
        PttConfig {
            push_to_talk: true,
            double_tap_latch: true,
            double_tap_window: WINDOW,
        }
    }

    /// Push-to-talk with the double-tap feature switched off, i.e. v0.3.0 behaviour.
    fn ptt_no_latch() -> PttConfig {
        PttConfig {
            double_tap_latch: false,
            ..ptt()
        }
    }

    fn event(is_pressed: bool) -> PttEvent<'static> {
        PttEvent {
            binding_id: BINDING,
            is_pressed,
            config: ptt(),
            latched: false,
            pending: None,
            recording_binding: None,
            held_for: None,
            saw_autorepeat: false,
        }
    }

    // ---------------------------------------------------------------------
    // Classifier: push-to-talk basics (unchanged from v0.3.0)
    // ---------------------------------------------------------------------

    #[test]
    fn long_hold_release_while_recording_defers_release() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                recording_binding: Some(BINDING),
                held_for: Some(Duration::from_millis(900)),
                ..event(false)
            }),
            PttAction::DeferRelease
        );
    }

    #[test]
    fn autorepeat_press_matching_pending_grace_cancels_release() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                pending: Some((BINDING, PendingKind::Grace, Duration::from_millis(5))),
                recording_binding: Some(BINDING),
                ..event(true)
            }),
            PttAction::CancelRelease
        );
    }

    #[test]
    fn toggle_mode_press_and_release_pass_through() {
        let toggle = PttConfig::toggle();
        assert_eq!(
            classify_ptt_event(PttEvent {
                config: toggle,
                pending: Some((BINDING, PendingKind::TapWindow, Duration::from_millis(120))),
                recording_binding: Some(BINDING),
                ..event(true)
            }),
            PttAction::Passthrough
        );
        assert_eq!(
            classify_ptt_event(PttEvent {
                config: toggle,
                recording_binding: Some(BINDING),
                held_for: Some(Duration::from_millis(80)),
                ..event(false)
            }),
            PttAction::Passthrough
        );
    }

    #[test]
    fn press_for_different_binding_than_pending_release_passes_through() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                binding_id: "transcribe_with_post_process",
                pending: Some((BINDING, PendingKind::Grace, Duration::from_millis(5))),
                recording_binding: Some(BINDING),
                ..event(true)
            }),
            PttAction::Passthrough
        );
    }

    // ---------------------------------------------------------------------
    // Classifier: double-tap latch
    // ---------------------------------------------------------------------

    #[test]
    fn short_tap_release_opens_the_double_tap_window() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                recording_binding: Some(BINDING),
                held_for: Some(Duration::from_millis(120)),
                ..event(false)
            }),
            PttAction::DeferTapRelease
        );
    }

    #[test]
    fn second_tap_inside_the_window_latches() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                pending: Some((BINDING, PendingKind::TapWindow, Duration::from_millis(140))),
                recording_binding: Some(BINDING),
                ..event(true)
            }),
            PttAction::Latch
        );
    }

    /// A tap window that outlived its recording must not latch an idle app.
    #[test]
    fn a_tap_window_without_a_live_recording_does_not_latch() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                pending: Some((BINDING, PendingKind::TapWindow, Duration::from_millis(140))),
                recording_binding: None,
                ..event(true)
            }),
            PttAction::Passthrough
        );
    }

    /// The X11 guard: once a recording has seen auto-repeat the key is down, so
    /// a release from it can never open the double-tap window — however slow the
    /// repeat rate is, and however short the hold looks.
    #[test]
    fn a_release_after_autorepeat_is_never_treated_as_a_tap() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                recording_binding: Some(BINDING),
                held_for: Some(Duration::from_millis(120)),
                saw_autorepeat: true,
                ..event(false)
            }),
            PttAction::DeferRelease
        );
    }

    /// The guard that keeps auto-repeat and contact bounce from latching:
    /// a press arriving within `MIN_TAP_GAP` of the release means the key was
    /// never really let go.
    #[test]
    fn press_too_soon_after_a_tap_is_autorepeat_not_a_second_tap() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                pending: Some((BINDING, PendingKind::TapWindow, Duration::from_millis(4))),
                recording_binding: Some(BINDING),
                ..event(true)
            }),
            PttAction::CancelRelease
        );
    }

    #[test]
    fn a_hold_never_opens_the_double_tap_window() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                recording_binding: Some(BINDING),
                held_for: Some(TAP_MAX_HOLD + Duration::from_millis(1)),
                ..event(false)
            }),
            PttAction::DeferRelease
        );
    }

    #[test]
    fn taps_defer_normally_when_the_latch_is_disabled() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                config: ptt_no_latch(),
                recording_binding: Some(BINDING),
                held_for: Some(Duration::from_millis(120)),
                ..event(false)
            }),
            PttAction::DeferRelease
        );
    }

    #[test]
    fn releases_are_ignored_while_latched() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                latched: true,
                recording_binding: Some(BINDING),
                held_for: Some(Duration::from_millis(50)),
                ..event(false)
            }),
            PttAction::Ignore
        );
    }

    #[test]
    fn a_press_stops_a_latched_recording() {
        assert_eq!(
            classify_ptt_event(PttEvent {
                latched: true,
                recording_binding: Some(BINDING),
                ..event(true)
            }),
            PttAction::StopLatched
        );
    }

    // ---------------------------------------------------------------------
    // Sequence-level regression coverage for issue #1539.
    //
    // Under X11 key auto-repeat, holding a push-to-talk key does not emit one
    // long press. It emits the initial press followed by a stream of
    // synthesized release/press pairs, then a single genuine release on key-up.
    // Before the fix, every synthesized release passed straight through and
    // stopped recording, so holding the key "rapidly toggled" recording on and
    // off. The fix defers each release for a short grace window and cancels it
    // when the matching auto-repeat press arrives.
    //
    // The unit tests above assert `classify_ptt_event` in isolation. The
    // simulator below threads that classifier through the same `pending_release`
    // / `stage` / `latched` state transitions the coordinator loop performs, so
    // a whole event burst can be exercised deterministically without a Tauri
    // AppHandle or real timers.
    // ---------------------------------------------------------------------

    #[derive(Clone, Copy)]
    enum Ev {
        /// A key-down event (real press or a synthesized auto-repeat press).
        Press,
        /// A key-up event (synthesized auto-repeat release or the genuine key-up).
        Release,
        /// Time passes with no event: the pending release's deadline may elapse.
        Wait(u64),
    }

    #[derive(Debug, PartialEq, Eq)]
    enum SimStage {
        Idle,
        Recording,
        Processing,
    }

    struct SimResult {
        starts: u32,
        stops: u32,
        stage: SimStage,
        latched: bool,
    }

    /// Mirror of the coordinator loop's decision logic for a single binding: it
    /// calls the real `classify_ptt_event` and applies the exact same Defer /
    /// Cancel / Latch / debounce / start / stop transitions, on a virtual clock.
    fn simulate(config: PttConfig, events: &[Ev]) -> SimResult {
        let mut stage = SimStage::Idle;
        let mut pending: Option<(PendingKind, u64, u64)> = None; // kind, released_at, deadline
        let mut last_press_ms: Option<u64> = None;
        let mut recording_started_ms: Option<u64> = None;
        let mut latched = false;
        let mut saw_autorepeat = false;
        let mut clock_ms: u64 = 0;
        let mut starts = 0u32;
        let mut stops = 0u32;
        let debounce_ms = DEBOUNCE.as_millis() as u64;

        /// Fire a pending release whose deadline has passed, as the coordinator's
        /// `RecvTimeoutError::Timeout` arm does.
        fn expire(
            clock_ms: u64,
            pending: &mut Option<(PendingKind, u64, u64)>,
            stage: &mut SimStage,
            recording_started_ms: &mut Option<u64>,
            saw_autorepeat: &mut bool,
            stops: &mut u32,
        ) {
            if let Some((_, _, deadline)) = *pending {
                if clock_ms >= deadline {
                    *pending = None;
                    if *stage == SimStage::Recording {
                        *stage = SimStage::Processing;
                        *recording_started_ms = None;
                        *saw_autorepeat = false;
                        *stops += 1;
                    }
                }
            }
        }

        for ev in events {
            // Auto-repeat events arrive a few ms apart, well inside DEBOUNCE.
            let step = if let Ev::Wait(ms) = ev { *ms } else { 5 };
            clock_ms += step;
            expire(
                clock_ms,
                &mut pending,
                &mut stage,
                &mut recording_started_ms,
                &mut saw_autorepeat,
                &mut stops,
            );

            let is_pressed = match ev {
                Ev::Press => true,
                Ev::Release => false,
                Ev::Wait(_) => continue,
            };

            let pending_info = pending.map(|(kind, released_at, _)| {
                (BINDING, kind, Duration::from_millis(clock_ms - released_at))
            });
            let recording_binding = (stage == SimStage::Recording).then_some(BINDING);

            let action = classify_ptt_event(PttEvent {
                binding_id: BINDING,
                is_pressed,
                config,
                latched,
                pending: pending_info,
                recording_binding,
                held_for: recording_started_ms.map(|s| Duration::from_millis(clock_ms - s)),
                saw_autorepeat,
            });

            match action {
                PttAction::Ignore => continue,
                PttAction::CancelRelease => {
                    pending = None;
                    saw_autorepeat = true;
                    continue;
                }
                PttAction::DeferRelease => {
                    pending = Some((
                        PendingKind::Grace,
                        clock_ms,
                        clock_ms + RELEASE_GRACE.as_millis() as u64,
                    ));
                    continue;
                }
                PttAction::DeferTapRelease => {
                    pending = Some((
                        PendingKind::TapWindow,
                        clock_ms,
                        clock_ms + config.double_tap_window.as_millis() as u64,
                    ));
                    continue;
                }
                PttAction::Latch => {
                    pending = None;
                    latched = true;
                    last_press_ms = Some(clock_ms);
                    continue;
                }
                PttAction::StopLatched => {
                    if last_press_ms.is_some_and(|t| clock_ms - t < debounce_ms) {
                        continue;
                    }
                    last_press_ms = Some(clock_ms);
                    latched = false;
                    recording_started_ms = None;
                    saw_autorepeat = false;
                    stage = SimStage::Processing;
                    stops += 1;
                    continue;
                }
                PttAction::Passthrough => {}
            }

            if is_pressed {
                if last_press_ms.is_some_and(|t| clock_ms - t < debounce_ms) {
                    continue;
                }
                last_press_ms = Some(clock_ms);
            }

            if is_pressed && stage == SimStage::Idle {
                stage = SimStage::Recording;
                recording_started_ms = Some(clock_ms);
                saw_autorepeat = false;
                starts += 1;
            } else if !is_pressed && stage == SimStage::Recording {
                stage = SimStage::Processing;
                recording_started_ms = None;
                saw_autorepeat = false;
                stops += 1;
            }
        }

        SimResult {
            starts,
            stops,
            stage,
            latched,
        }
    }

    /// Initial press plus several synthesized release/press pairs, as X11 emits
    /// while a push-to-talk key is held down. The first auto-repeat release only
    /// arrives after the repeat delay, which is well past `TAP_MAX_HOLD`.
    fn autorepeat_burst() -> Vec<Ev> {
        let mut events = vec![Ev::Press, Ev::Wait(500)];
        for _ in 0..6 {
            events.push(Ev::Release);
            events.push(Ev::Press);
        }
        events
    }

    /// Regression for #1539: a burst of X11 auto-repeat release/press pairs must
    /// not stop recording. Before the fix the first synthesized release stopped
    /// recording immediately (stops == 1, stage left Recording), which produced
    /// the rapid on/off toggling.
    #[test]
    fn x11_autorepeat_burst_does_not_toggle_recording() {
        let result = simulate(ptt(), &autorepeat_burst());
        assert_eq!(result.starts, 1, "recording should start exactly once");
        assert_eq!(
            result.stops, 0,
            "synthesized auto-repeat releases must not stop recording mid-burst"
        );
        assert_eq!(
            result.stage,
            SimStage::Recording,
            "recording must remain active across the entire auto-repeat burst"
        );
        assert!(!result.latched, "a held key must not latch hands-free mode");
    }

    /// Complements the burst test: once the key is genuinely released and the
    /// grace window elapses with no re-press, recording stops exactly once.
    #[test]
    fn genuine_release_after_grace_stops_recording_once() {
        let mut events = autorepeat_burst();
        events.push(Ev::Release); // genuine key-up
        events.push(Ev::Wait(RELEASE_GRACE.as_millis() as u64 + 5));
        let result = simulate(ptt(), &events);
        assert_eq!(result.starts, 1, "recording should start exactly once");
        assert_eq!(
            result.stops, 1,
            "a genuine release should stop recording exactly once"
        );
        assert_eq!(result.stage, SimStage::Processing);
    }

    /// The feature itself: tap, tap, talk, tap. Recording starts on the first
    /// tap, survives both key-ups, and only the closing tap stops it.
    #[test]
    fn double_tap_latches_and_a_third_tap_stops() {
        let result = simulate(
            ptt(),
            &[
                Ev::Press,
                Ev::Wait(120),
                Ev::Release, // first tap ends, opens the window
                Ev::Wait(140),
                Ev::Press, // second tap latches
                Ev::Wait(60),
                Ev::Release,    // ignored while latched
                Ev::Wait(4000), // the user talks, hands free
                Ev::Press,      // closing tap
                Ev::Wait(60),
                Ev::Release,
            ],
        );
        assert_eq!(result.starts, 1, "recording should start exactly once");
        assert_eq!(
            result.stops, 1,
            "only the closing tap should stop the recording"
        );
        assert_eq!(result.stage, SimStage::Processing);
        assert!(!result.latched, "the closing tap must clear the latch");
    }

    /// A single tap with no follow-up still behaves like a short push-to-talk
    /// press — it just waits out the double-tap window first.
    #[test]
    fn single_tap_stops_after_the_window_expires() {
        let result = simulate(
            ptt(),
            &[
                Ev::Press,
                Ev::Wait(120),
                Ev::Release,
                Ev::Wait(WINDOW.as_millis() as u64 + 20),
            ],
        );
        assert_eq!(result.starts, 1);
        assert_eq!(result.stops, 1, "a lone tap should still transcribe");
        assert_eq!(result.stage, SimStage::Processing);
        assert!(!result.latched);
    }

    /// A second tap arriving after the window has closed is too late to latch.
    #[test]
    fn second_tap_after_the_window_does_not_latch() {
        let result = simulate(
            ptt(),
            &[
                Ev::Press,
                Ev::Wait(120),
                Ev::Release,
                Ev::Wait(WINDOW.as_millis() as u64 + 50),
                Ev::Press,
            ],
        );
        assert!(!result.latched, "the window had already closed");
        assert_eq!(result.stops, 1, "the first tap transcribed on its own");
    }

    /// Fast auto-repeat — the shape X11 actually emits at its default rate — is
    /// rejected by `MIN_TAP_GAP`: the synthesized press arrives milliseconds
    /// after the synthesized release, far too fast to be a second tap.
    #[test]
    fn fast_autorepeat_with_a_short_delay_does_not_latch() {
        // A repeat delay inside TAP_MAX_HOLD, so the first synthesized release
        // does open a tap window — the press that follows must still not latch.
        let mut events = vec![Ev::Press, Ev::Wait(250)];
        for _ in 0..5 {
            events.push(Ev::Release);
            events.push(Ev::Press);
        }
        events.push(Ev::Release); // genuine key-up
        events.push(Ev::Wait(RELEASE_GRACE.as_millis() as u64 + 5));

        let result = simulate(ptt(), &events);
        assert!(!result.latched, "a held key must not latch");
        assert_eq!(result.starts, 1);
        assert_eq!(
            result.stops, 1,
            "the hold should end exactly once, on the genuine key-up"
        );
        assert_eq!(result.stage, SimStage::Processing);
    }

    /// Holding the key is untouched by the feature: press, talk, release.
    #[test]
    fn plain_hold_still_works_with_the_latch_enabled() {
        let result = simulate(
            ptt(),
            &[
                Ev::Press,
                Ev::Wait(2500),
                Ev::Release,
                Ev::Wait(RELEASE_GRACE.as_millis() as u64 + 5),
            ],
        );
        assert_eq!(result.starts, 1);
        assert_eq!(result.stops, 1);
        assert!(!result.latched, "a hold must never latch");
        assert_eq!(result.stage, SimStage::Processing);
    }

    /// With the setting off, a double tap is just two short push-to-talk presses.
    #[test]
    fn double_tap_does_nothing_when_the_setting_is_off() {
        let result = simulate(
            ptt_no_latch(),
            &[
                Ev::Press,
                Ev::Wait(120),
                Ev::Release,
                Ev::Wait(RELEASE_GRACE.as_millis() as u64 + 5),
                Ev::Press,
                Ev::Wait(120),
                Ev::Release,
                Ev::Wait(RELEASE_GRACE.as_millis() as u64 + 5),
            ],
        );
        assert!(!result.latched);
        assert_eq!(result.stops, 1, "the pipeline is busy after the first tap");
    }
}
