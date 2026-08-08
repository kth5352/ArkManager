# Release Notes HTML Fix Design

## Problem

`electron-updater` can return GitHub release notes as HTML. The Settings dialog currently renders the note as a text node, so tags such as `<p>`, `<ul>`, and `<li>` are visible to the user.

## Design

- Normalize release notes at the main-process boundary before sending them over IPC.
- Convert block elements to readable line breaks and list items to `- ` bullets.
- Decode HTML entities and retain visible inline text.
- Remove script, style, template, noscript, SVG, iframe, and object content before extracting text.
- Leave already-plain release notes unchanged.
- Keep the renderer text-only; do not use `dangerouslySetInnerHTML` or add an HTML sanitizer dependency.

## Release Procedure

- Keep package version `1.1.0`.
- Run targeted and full verification, then rebuild the Windows installer.
- Move `v1.1.0` to the fix commit because the user explicitly requested replacement under the same version.
- Replace the installer, blockmap, and `latest.yml` assets together and verify their remote hashes.
