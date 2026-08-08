# Window Close Behavior Design

## Goal

Replace the current unconditional close-to-tray behavior with an explicit user choice. Ark Manager 1.1.1 asks whether to quit or remain in the system tray, can remember that choice, and exposes the same policy in Settings.

## Persisted Policy

Add the `window-close-behavior` setting with exactly three values:

- `ask`: show the close prompt every time. This is the default when no valid value is stored.
- `quit`: close Ark Manager completely without prompting.
- `tray`: hide the main window and keep Ark Manager running in the system tray without prompting.

An invalid or corrupted stored value is treated as `ask` and is never passed to the renderer as a valid policy.

## Close Prompt

Closing the main window while the policy is `ask` prevents the close and opens one Electron native message box owned by the main window.

The prompt contains:

- Primary/default button: `프로그램 종료` / localized equivalent.
- Secondary button: `시스템 트레이에서 계속 실행` / localized equivalent.
- Cancel button: `취소` / localized equivalent.
- Checkbox: `항상 이 옵션 사용` / localized equivalent, unchecked by default.

Choosing quit exits the application. Choosing tray hides the main window. Choosing cancel leaves the window open. The checkbox only persists `quit` or `tray`; cancel never changes the setting.

The prompt uses the persisted application locale and supports Korean, Japanese, and English. A pending prompt blocks duplicate prompts from repeated close requests. If the parent window disappears or the message box rejects, no close action is taken.

## Quit Exceptions

Explicit application-level quit paths do not show the close prompt:

- Exit from the tray context menu.
- Electron application quit.
- Updater-driven quit and install.
- Any close occurring after `before-quit` has marked the application as quitting.

These paths continue to flush active play sessions and close the detached media player through the existing `before-quit` lifecycle.

## Persistence Failure

Remembering a choice is best effort. If writing the setting fails, Ark Manager logs the error and still performs the selected quit or tray action. Because the policy was not saved, the prompt appears again on the next close.

## Settings UI

Add a Window Close Behavior section to Settings with a three-option select control:

- Ask every time
- Quit the application
- Keep running in the system tray

Changing the selection persists immediately and updates the React Query cache. Selecting `ask` restores the close prompt. The section includes a short localized description and follows the existing Settings typography, spacing, select, and disabled-pending patterns.

## Architecture

- Shared IPC types define `WindowCloseBehaviorSchema` and add `window-close-behavior` to `SettingKeySchema`.
- The settings IPC validates stored close behavior before returning it.
- The preload bridge exposes typed get/set methods.
- The renderer settings service owns the query and mutation used by Settings.
- A focused main-process close-behavior module owns parsing and pure decision logic so quit, tray, cancel, and remember behavior can be unit tested without Electron windows.
- `electron/main/index.ts` coordinates the native dialog, persistence, window hiding, and `app.quit()` using those decisions.

## Testing

- Stored-value tests cover `ask`, `quit`, `tray`, missing values, and corrupted values.
- Pure decision tests cover all three prompt responses with the checkbox both checked and unchecked.
- Main close-flow tests cover remembered quit, remembered tray, ask/prompt, duplicate prompt suppression, cancellation, and persistence failure where practical through extracted dependencies.
- Settings service and IPC types compile through the existing project references.
- Run targeted tests, all Vitest tests, typecheck, lint, Prettier checks, and the production Windows build.

## Release

- Change `package.json` and `package-lock.json` from `1.1.0` to `1.1.1`.
- Update README features and add a 1.1.1 changelog entry.
- Build `Ark Manager Setup 1.1.1.exe`, its blockmap, and `latest.yml`.
- Commit and push `master`, create tag `v1.1.1`, and publish GitHub Release `Ark Manager 1.1.1` with all updater assets.
- Verify remote tag, release body, installer digest, blockmap digest, `latest.yml`, and latest-release status.
