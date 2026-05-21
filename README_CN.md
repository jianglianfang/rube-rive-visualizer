# RUBE-Rive 可视化器 & 生成器

[English](README.md)

基于 Web 的物理驱动 Rive 动画**预览**和**生成**工具。连接 RUBE 物理编辑器 (.json) 和 Rive 矢量动画 (.riv)，通过 MVVM 数据绑定实现实时物理动画。

**[在线演示 →](https://jianglianfang.github.io/rube-rive-visualizer/)**

## 两种模式

### 🎬 预览模式（Preview）
加载已有的 `.json`（RUBE 导出）+ `.riv` 文件对，实时预览物理驱动动画效果。

### ⚙️ 生成模式（Generator）
拖入单个 `.riv` 文件，**自动生成**物理场景。包括：
- 自动检测组件形状（椭圆、圆角矩形、贝塞尔曲线）
- 每个刚体独立的形状精度控制（顶点数滑块）
- 圆形碰撞边界（匹配圆形表盘）
- 实时物理模拟驱动 Rive 组件
- 导出生成的场景为 RUBE 兼容 JSON

## 功能特性

- 🎨 **Rive 渲染** — 加载 .riv 文件，完整支持动画、状态机和点击事件
- ⚡ **Box2D 物理** — 通过 box2d-wasm（WebAssembly）实现实时物理模拟
- 🔗 **MVVM 绑定** — 将 RUBE Body 的 CustomProperties（`VM`）映射到 Rive ViewModel 变换（x, y, r）
- 🔲 **调试叠加层** — 在 Rive 渲染上方显示物理线框
- 🖱️ **交互操作** — 点击选中刚体、拖拽施加力、调整物理参数
- 🧭 **重力传感器** — 通过设备方向传感器驱动重力
- 📱 **纯静态** — 无需后端，完全在浏览器中运行

## 快速开始

### GitHub Pages 部署

1. 将 `web/` 目录推送到你的 GitHub 仓库
2. 进入 **Settings → Pages → Source** → 选择分支和 `/web` 目录
3. 通过 `https://<用户名>.github.io/<仓库名>/` 访问

### 本地开发

任何静态文件服务器都可以：

```bash
# Node.js
npx serve web

# Python
python3 -m http.server 8000 --directory web

# VS Code
# 安装 "Live Server" 扩展，右键 web/index.html → Open with Live Server
```

然后打开 `http://localhost:8000`。

> ⚠️ 直接通过 `file://` 打开 `index.html` 不会工作 — ES 模块需要 HTTP 服务。

### 使用 — 预览模式

1. 打开网页（默认标签：Preview）
2. 将 `.json`（RUBE 导出）和 `.riv`（Rive 文件）拖放到放置区域
3. 物理模拟自动开始
4. 使用控件：播放/暂停（Space）、单步（→）、重置（R）、速度滑块

### 使用 — 生成模式

1. 切换到 **Generator** 标签
2. 拖入 `.riv` 文件（必须包含 ViewModel 绑定的组件）
3. 物理场景自动生成（默认暂停状态）
4. 调试形状叠加在 Rive 上 — 可以看到哪个刚体对应哪个组件
5. 在编辑面板中选择刚体或在画布上点击来调整参数
6. 使用 **Shape Detail** 滑块控制每个刚体的顶点精度
7. 按 Play 开始模拟，Export JSON 保存

## 调试模式

点击 **Debug** 按钮（或按 D）循环切换：

| 模式 | 说明 |
|------|------|
| ⬜ 关闭 | 仅显示 Rive 动画 |
| 🔲 叠加 | 物理线框半透明叠加在 Rive 上 |
| ◫ 并排 | 左侧 Rive，右侧物理调试 |

## 操控

| 操作 | 快捷键/鼠标 |
|------|------------|
| 播放/暂停 | Space |
| 单步（暂停时）| → |
| 重置 | R |
| 调试模式 | D |
| 选中刚体 | 点击 |
| 拖拽刚体 | 点击拖动（仅动态体）|
| 速度 | 滑块（0.1× – 3.0×）|

## 工作原理

### 预览模式
```
RUBE .json → 解析器 → Box2D 世界 → 物理步进
                                        ↓
                              MVVM 绑定器（坐标转换）
                                        ↓
                              Rive ViewModel (x, y, r)
                                        ↓
                              Rive 渲染器 → Canvas
```

### 生成模式
```
.riv 文件 → RiveAnalyzer（二进制解析 + 运行时分析）
                ↓
         BoundComponents（形状、位置、VM 名称）
                ↓
         RubeSceneGenerator → Box2D 世界 + 圆形边界
                ↓
         物理步进 → MVVM 绑定 → Rive ViewModel → Canvas
                ↓
         RubeSerializer → 导出 .json（RUBE 兼容格式）
```

### 坐标转换

| 属性 | 公式 | 说明 |
|------|------|------|
| x | `box2d_x × 32 + artboard_center_x` | 米 → 像素 + artboard 偏移 |
| y | `-box2d_y × 32 + artboard_center_y` | Y 轴翻转（Box2D 向上 → Rive 向下）|
| r | `-box2d_angle` | 弧度，取反（Box2D 逆时针 → Rive 顺时针）|

### MVVM 绑定协议

每个 RUBE Body 的 CustomProperty `{"name": "VM", "string": "t1"}` 映射到 Rive World ViewModel 的嵌套属性 `t1`，包含 `x`、`y`、`r` 数值子属性。

## 物理编辑器（生成模式）

选中刚体后可调整：
- **参数**：密度、摩擦力、弹性、重力缩放
- **形状精度**：顶点数滑块（3–100），用于非矩形形状
  - 控制椭圆段数、贝塞尔曲线采样、圆角弧度分辨率
  - 每个刚体独立设置

## 项目结构

```
web/
├── index.html              # 主页（双标签布局）
├── style.css               # 暗色主题样式
├── src/
│   ├── app.js              # 主控制器 + 预览模式
│   ├── generatorApp.js     # 生成模式控制器
│   ├── rubeParser.js       # RUBE JSON 解析器
│   ├── rubeSerializer.js   # RUBE JSON 序列化器
│   ├── rubeSceneGenerator.js # 从 Rive 分析结果生成场景
│   ├── riveAnalyzer.js     # Rive .riv 二进制分析
│   ├── rivBinaryParser.js  # Rive 二进制格式解析器
│   ├── physicsSimulator.js # Box2D 物理引擎封装
│   ├── mvvmBinder.js       # MVVM 绑定 + 坐标转换
│   ├── physicsEditor.js    # 物理参数编辑器 UI
│   ├── convexDecomposer.js # 凸多边形分解
│   ├── fileLoader.js       # 拖放文件加载
│   ├── debugRenderer.js    # 物理调试可视化
│   ├── gravitySensor.js    # 设备方向重力
│   └── models.js           # 数据模型 + 常量
└── tests/                  # Vitest 测试套件
```

## 依赖（通过 CDN 加载）

- [@rive-app/canvas](https://www.npmjs.com/package/@rive-app/canvas) — Rive WASM 运行时
- [box2d-wasm](https://github.com/Birch-san/box2d-wasm) — Box2D 编译为 WebAssembly

运行时无需 `npm install` — 所有依赖从 unpkg CDN 加载。

## 开发

```bash
# 安装测试依赖
cd web && npm install

# 运行测试
npm test
```

测试使用 [Vitest](https://vitest.dev/) + [fast-check](https://fast-check.dev/) 进行属性测试。

## 许可证

MIT
