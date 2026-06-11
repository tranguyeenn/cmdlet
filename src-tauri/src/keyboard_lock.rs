//! System-wide keyboard lock.
//!
//! When locked, a CoreGraphics event tap suppresses every key event across all
//! applications until the user clicks the unlock button in the popup window.
//! The tap runs on a dedicated thread with its own run loop; flipping the
//! `LOCKED` flag back to `false` lets that loop exit, which drops the tap and
//! restores normal typing. Creating an active tap requires Accessibility
//! permission, so we check for it up front and surface a clear error otherwise.

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    CallbackResult,
};

static LOCKED: AtomicBool = AtomicBool::new(false);

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

/// Whether the app holds macOS Accessibility permission (required for the tap).
pub fn accessibility_granted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

/// Begin suppressing all keyboard input. Returns an error (without locking) when
/// Accessibility permission is missing, since the event tap cannot be created.
pub fn start_lock() -> Result<(), String> {
    if !accessibility_granted() {
        return Err(
            "Cmdlet needs Accessibility permission to lock the keyboard. Enable it in \
             System Settings > Privacy & Security > Accessibility, then press Ctrl+L again."
                .into(),
        );
    }

    // Already locked (or a lock thread is live): nothing more to do.
    if LOCKED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    thread::spawn(|| {
        let outcome = CGEventTap::with_enabled(
            CGEventTapLocation::Session,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::Default,
            vec![
                CGEventType::KeyDown,
                CGEventType::KeyUp,
                CGEventType::FlagsChanged,
            ],
            |_proxy, _event_type, _event| {
                if LOCKED.load(Ordering::SeqCst) {
                    CallbackResult::Drop
                } else {
                    CallbackResult::Keep
                }
            },
            || {
                // Pump the tap's run loop in short slices so we notice an unlock
                // request within ~250ms and can tear the tap down promptly.
                while LOCKED.load(Ordering::SeqCst) {
                    CFRunLoop::run_in_mode(
                        unsafe { kCFRunLoopDefaultMode },
                        Duration::from_millis(250),
                        false,
                    );
                }
            },
        );

        // Tap creation can still fail (e.g. permission revoked mid-flight);
        // reset the flag so the UI can recover instead of showing a fake lock.
        if outcome.is_err() {
            LOCKED.store(false, Ordering::SeqCst);
        }
    });

    Ok(())
}

/// Release the keyboard lock. The tap thread's loop exits on its next slice.
pub fn stop_lock() {
    LOCKED.store(false, Ordering::SeqCst);
}
