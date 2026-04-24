# RUBE-Rive Visualizer

A web-based visualization tool that bridges **RUBE physics editor** (.json) and **Rive vector animation** (.riv) through MVVM data binding, enabling real-time physics-driven animation preview.

**[Live Demo →](https://your-username.github.io/rube-rive-visualizer/)**

## Features

- 🎨 **Rive Rendering** — Load .riv files with full animation, state machine, and click event support
- ⚡ **Box2D Physics** — Real-time physics simulation via box2d-wasm (WebAssembly)
- 🔗 **MVVM Binding** — Automatically maps RUBE Body CustomProperties (`VM`) to Rive ViewModel transform (x, y, r)
- 🔲 **Debug Overlay** — Toggle physics wireframe overlay or side-by-side comparison
- 🖱️ **Interactive** — Click to inspect bodies, drag to apply forces via mouse joint
- 📱 **Pure Static** — No backend required, runs entirely in the browser

## Quick Start

### GitHub Pages

1. Push the `web/` directory to your GitHub repository
2. Go to **Settings → Pages → Source** → select branch and `/web` folder (or root if you move files)
3. Access at `https://<username>.github.io/<repo>/`

### Local Development

Any static file server works:

```bash
# Node.js
npx serve web

# Python
python3 -m http.server 8000 --directory web

# VS Code
# Install "Live Server" extension, right-click web/index.html → Open with Live Server
```

Then open `http://localhost:8000` (or the URL shown by your server).

> ⚠️ Opening `index.html` directly via `file://` won't work — ES modules require HTTP.

### Usage

1. Open the web page
2. Drag & drop a `.json` (RUBE export) and `.riv` (Rive file) onto the drop zone
3. Physics simulation starts automatically
4. Use controls: Play/Pause (Space), Step (→), Reset (R), Speed slider

## Debug Modes

Click the **Debug** button (or press D) to cycle through:

| Mode | Description |
|------|-------------|
| ⬜ Debug Off | Only Rive animation visible |
| 🔲 Overlay | Physics wireframes overlaid on Rive (semi-transparent) |
| ◫ Side-by-Side | Rive on left, physics debug on right |

## Controls

| Action | Key / Mouse |
|--------|-------------|
| Play / Pause | Space |
| Step (paused) | → |
| Reset | R |
| Debug mode | D |
| Select body | Click |
| Drag body | Click + drag (dynamic bodies) |
| Speed | Slider (0.1× – 3.0×) |

## How It Works

```
RUBE .json → Parser → Box2D World → Physics Step
                                        ↓
                              MVVM Binder (coordinate conversion)
                                        ↓
                              Rive ViewModel (x, y, r per body)
                                        ↓
                              Rive Renderer → Canvas
```

### Coordinate Conversion

| Property | Formula | Notes |
|----------|---------|-------|
| x | `box2d_x × 32 + artboard_center_x` | Meters → pixels + artboard offset |
| y | `-box2d_y × 32 + artboard_center_y` | Y-axis flip (Box2D up → Rive down) |
| r | `-box2d_angle` | Radians, negated (Box2D CCW → Rive CW) |

### MVVM Binding Protocol

Each RUBE Body with a CustomProperty `{"name": "VM", "string": "t1"}` maps to a Rive World ViewModel nested property `t1` containing `x`, `y`, `r` number sub-properties.

## Project Structure

```
web/
├── index.html          # Main page
├── style.css           # Dark theme styles
├── app.js              # Application controller
├── rubeParser.js       # RUBE JSON parser
├── rubeSerializer.js   # RUBE JSON serializer
├── physicsSimulator.js # Box2D physics (box2d-wasm)
├── mvvmBinder.js       # MVVM binding + coordinate conversion
├── fileLoader.js       # Drag-and-drop file loading
├── debugRenderer.js    # Physics debug visualization
├── models.js           # Data models + constants
└── serve.sh            # Local dev server script
```

## Dependencies (loaded via CDN)

- [@rive-app/canvas](https://www.npmjs.com/package/@rive-app/canvas) — Rive WASM runtime
- [box2d-wasm](https://github.com/Birch-san/box2d-wasm) — Box2D compiled to WebAssembly

No `npm install` required for running — all dependencies are loaded from unpkg CDN.

## Development

```bash
# Install test dependencies
cd web && npm install

# Run tests
npm test
```

Tests use [Vitest](https://vitest.dev/) + [fast-check](https://fast-check.dev/) for property-based testing.

## License

MIT
