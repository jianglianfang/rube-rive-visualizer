# RUBE-Rive Visualizer & Generator

A web-based tool for **previewing** and **generating** physics-driven Rive animations. Bridges RUBE physics editor (.json) and Rive vector animation (.riv) through MVVM data binding.

**[Live Demo →](https://jianglianfang.github.io/rube-rive-visualizer/)**

## Two Modes

### 🎬 Preview Mode
Load an existing `.json` (RUBE export) + `.riv` pair to preview physics-driven animation in real-time.

### ⚙️ Generator Mode
Drop a single `.riv` file to **automatically generate** a physics scene from Rive ViewModel-bound components. Includes:
- Auto-detection of component shapes (ellipse, rounded rect, bezier curves)
- Per-body shape detail control (vertex precision slider)
- Circular boundary matching the watch face
- Real-time physics simulation driving Rive components
- Export generated scene as RUBE-compatible JSON

## Features

- 🎨 **Rive Rendering** — Load .riv files with full animation, state machine, and click event support
- ⚡ **Box2D Physics** — Real-time physics simulation via box2d-wasm (WebAssembly)
- 🔗 **MVVM Binding** — Maps RUBE Body CustomProperties (`VM`) to Rive ViewModel transform (x, y, r)
- 🔲 **Debug Overlay** — Toggle physics wireframe overlay on top of Rive rendering
- 🖱️ **Interactive** — Click to select bodies, drag to apply forces, adjust physics params
- 🧭 **Gravity Sensor** — Tilt-driven gravity via device orientation
- 📱 **Pure Static** — No backend required, runs entirely in the browser

## Quick Start

### GitHub Pages

1. Push the `web/` directory to your GitHub repository
2. Go to **Settings → Pages → Source** → select branch and `/web` folder
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

Then open `http://localhost:8000`.

> ⚠️ Opening `index.html` directly via `file://` won't work — ES modules require HTTP.

### Usage — Preview Mode

1. Open the web page (default tab: Preview)
2. Drag & drop a `.json` (RUBE export) and `.riv` (Rive file) onto the drop zone
3. Physics simulation starts automatically
4. Use controls: Play/Pause (Space), Step (→), Reset (R), Speed slider

### Usage — Generator Mode

1. Switch to the **Generator** tab
2. Drop a `.riv` file (must contain ViewModel-bound components)
3. Physics scene is generated automatically (starts paused)
4. Debug shapes overlay on Rive — see which rigid body maps to which component
5. Select bodies in the editor panel or click on canvas to adjust parameters
6. Use the **Shape Detail** slider to control vertex precision per body
7. Press Play to simulate, Export JSON to save

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

### Preview Mode
```
RUBE .json → Parser → Box2D World → Physics Step
                                        ↓
                              MVVM Binder (coordinate conversion)
                                        ↓
                              Rive ViewModel (x, y, r per body)
                                        ↓
                              Rive Renderer → Canvas
```

### Generator Mode
```
.riv file → RiveAnalyzer (binary parse + runtime)
                ↓
         BoundComponents (shapes, positions, VM names)
                ↓
         RubeSceneGenerator → Box2D World + circular boundary
                ↓
         Physics Step → MVVM Binder → Rive ViewModel → Canvas
                ↓
         RubeSerializer → Export .json (RUBE-compatible)
```

### Coordinate Conversion

| Property | Formula | Notes |
|----------|---------|-------|
| x | `box2d_x × 32 + artboard_center_x` | Meters → pixels + artboard offset |
| y | `-box2d_y × 32 + artboard_center_y` | Y-axis flip (Box2D up → Rive down) |
| r | `-box2d_angle` | Radians, negated (Box2D CCW → Rive CW) |

### MVVM Binding Protocol

Each RUBE Body with a CustomProperty `{"name": "VM", "string": "t1"}` maps to a Rive World ViewModel nested property `t1` containing `x`, `y`, `r` number sub-properties.

## Physics Editor (Generator Mode)

When a body is selected in Generator mode:
- **Parameters**: Density, Friction, Restitution, Gravity Scale
- **Shape Detail**: Vertex precision slider (3–100) for non-rectangular shapes
  - Controls ellipse segment count, bezier curve sampling, and corner arc resolution
  - Per-body: each body can have different precision

## Project Structure

```
web/
├── index.html              # Main page (two-tab layout)
├── style.css               # Dark theme styles
├── src/
│   ├── app.js              # Main controller + Preview mode
│   ├── generatorApp.js     # Generator mode controller
│   ├── rubeParser.js       # RUBE JSON parser
│   ├── rubeSerializer.js   # RUBE JSON serializer
│   ├── rubeSceneGenerator.js # Scene generation from Rive analysis
│   ├── riveAnalyzer.js     # Rive .riv binary analysis
│   ├── physicsSimulator.js # Box2D physics (box2d-wasm)
│   ├── mvvmBinder.js       # MVVM binding + coordinate conversion
│   ├── physicsEditor.js    # Physics parameter editor UI
│   ├── convexDecomposer.js # Convex polygon decomposition
│   ├── fileLoader.js       # Drag-and-drop file loading
│   ├── debugRenderer.js    # Physics debug visualization
│   ├── gravitySensor.js    # Device orientation gravity
│   └── models.js           # Data models + constants
└── tests/                  # Vitest test suite
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
