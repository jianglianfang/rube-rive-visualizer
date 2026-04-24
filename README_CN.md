# RUBE-Rive 可视化工具

基于 Web 的可视化工具，将 **RUBE 物理编辑器**（.json）与 **Rive 矢量动效**（.riv）通过 MVVM 数据绑定联动，实现物理驱动动画的实时预览。

**[在线演示 →](https://your-username.github.io/rube-rive-visualizer/)**

## 功能特性

- 🎨 **Rive 渲染** — 加载 .riv 文件，完整支持动画、状态机和点击事件
- ⚡ **Box2D 物理** — 通过 box2d-wasm（WebAssembly）实时物理模拟
- 🔗 **MVVM 绑定** — 自动将 RUBE Body 的 CustomProperty（`VM`）映射到 Rive ViewModel 的 transform（x, y, r）
- 🔲 **调试叠加** — 切换物理线框叠加或左右对比模式
- 🖱️ **交互操作** — 点击查看刚体信息，拖拽施加力（mouse joint）
- 📱 **纯静态** — 无需后端，完全在浏览器中运行

## 快速开始

### GitHub Pages 部署

1. 将 `web/` 目录推送到 GitHub 仓库
2. 进入 **Settings → Pages → Source** → 选择分支和 `/web` 目录
3. 访问 `https://<用户名>.github.io/<仓库名>/`

### 本地开发

任意静态文件服务器均可：

```bash
# Node.js
npx serve web

# Python
python3 -m http.server 8000 --directory web

# VS Code
# 安装 "Live Server" 扩展，右键 web/index.html → Open with Live Server
```

然后打开 `http://localhost:8000`。

> ⚠️ 直接双击 `index.html`（`file://` 协议）无法加载 — ES modules 需要 HTTP 服务。

### 使用方法

1. 打开网页
2. 将 `.json`（RUBE 导出）和 `.riv`（Rive 文件）拖拽到页面
3. 物理模拟自动开始
4. 使用控制按钮：播放/暂停（Space）、单步（→）、重置（R）、速度滑块

## 调试模式

点击 **Debug** 按钮（或按 D 键）循环切换：

| 模式 | 说明 |
|------|------|
| ⬜ Debug Off | 仅显示 Rive 动效 |
| 🔲 Overlay | 物理线框半透明叠加在 Rive 上 |
| ◫ Side-by-Side | 左边 Rive 动效，右边物理调试 |

## 操作说明

| 操作 | 按键 / 鼠标 |
|------|-------------|
| 播放 / 暂停 | Space |
| 单步（暂停时）| → |
| 重置 | R |
| 调试模式 | D |
| 选中刚体 | 点击 |
| 拖拽刚体 | 点击拖拽（动态体）|
| 速度调节 | 滑块（0.1× – 3.0×）|

## 工作原理

```
RUBE .json → 解析器 → Box2D 物理世界 → 物理步进
                                          ↓
                                MVVM 绑定器（坐标转换）
                                          ↓
                                Rive ViewModel（每个 body 的 x, y, r）
                                          ↓
                                Rive 渲染器 → Canvas
```

### 坐标转换

| 属性 | 公式 | 说明 |
|------|------|------|
| x | `box2d_x × 32 + artboard_center_x` | 米 → 像素 + artboard 偏移 |
| y | `-box2d_y × 32 + artboard_center_y` | Y 轴翻转（Box2D 向上 → Rive 向下）|
| r | `-box2d_angle` | 弧度，取反（Box2D 逆时针 → Rive 顺时针）|

### MVVM 绑定协议

每个带有 CustomProperty `{"name": "VM", "string": "t1"}` 的 RUBE Body 映射到 Rive World ViewModel 中名为 `t1` 的嵌套属性（包含 `x`、`y`、`r` 三个 number 子属性）。

## 项目结构

```
web/
├── index.html          # 主页面
├── style.css           # 暗色主题样式
├── app.js              # 应用控制器
├── rubeParser.js       # RUBE JSON 解析器
├── rubeSerializer.js   # RUBE JSON 序列化器
├── physicsSimulator.js # Box2D 物理模拟（box2d-wasm）
├── mvvmBinder.js       # MVVM 绑定 + 坐标转换
├── fileLoader.js       # 拖拽文件加载
├── debugRenderer.js    # 物理调试可视化
├── models.js           # 数据模型 + 常量
└── serve.sh            # 本地开发服务器脚本
```

## 依赖（通过 CDN 加载）

- [@rive-app/canvas](https://www.npmjs.com/package/@rive-app/canvas) — Rive WASM 运行时
- [box2d-wasm](https://github.com/Birch-san/box2d-wasm) — Box2D WebAssembly 编译版

运行时无需 `npm install` — 所有依赖从 unpkg CDN 加载。

## 开发

```bash
# 安装测试依赖
cd web && npm install

# 运行测试
npm test
```

测试使用 [Vitest](https://vitest.dev/) + [fast-check](https://fast-check.dev/) 进行属性测试。

## 许可

MIT
