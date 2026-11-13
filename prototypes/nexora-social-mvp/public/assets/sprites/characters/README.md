# NEXORA original sprite assets

The character atlas is an original transparent SVG sprite sheet designed for the NEXORA canvas renderer.

- File: `nexora-avatar-atlas.svg`
- Grid: 8 columns × 4 directional rows
- Cell: 80 × 104
- Rows: down, left, right, up
- Columns: idle, blink, walk A-D, dance, wave
- Manifest: `atlas.json`

The browser loads the atlas once and reuses the decoded image for every visible player. The animation controller draws only the selected source frame. The SVG is intentionally used as the first source format so the original art remains crisp on Retina displays; the renderer uses the standard CanvasImageSource interface and can accept PNG/WebP atlases later without changing its animation API.

The current atlas is an initial shared character base. Existing profile appearance data remains intact in the backend; expanded per-item layered art is a follow-on asset pass and is not represented as finished by this first integration.
