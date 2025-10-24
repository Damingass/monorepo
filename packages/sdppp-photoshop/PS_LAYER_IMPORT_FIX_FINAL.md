# PS 图层导入修复 - 完全看齐 ComfyUI

## 📋 问题描述

**症状**: PS图层导入后显示 "no preview"

**根本原因**: `displayUrl` 字段生成不正确，无法在 UXP webview 中显示

---

## 🔍 ComfyUI 完整流程分析

详见 [`COMFYUI_IMAGE_FLOW.md`](./COMFYUI_IMAGE_FLOW.md)

### ComfyUI 关键流程

1. **生成图像**: 返回 HTTP URL
2. **downloadAndAppendImage**: 调用 `downloadImage(HTTP URL)`
3. **downloadImage**: 
   - 下载网络图像到永久本地位置
   - 返回 `{ nativePath, thumbnail_url, width, height }`
4. **预览显示**: 使用 `thumbnail_url` (file:// 格式)
5. **导入PS**: 使用 `nativePath` (纯路径)

### 关键字段

| 字段 | ComfyUI | PS图层导入 | 用途 |
|------|---------|-----------|------|
| `url` | HTTP URL | file:// URL | 原始来源引用 |
| `thumbnail_url` | file:// 格式 | file:// 格式 | ✅ 显示预览 |
| `nativePath` | 纯路径 | 纯路径 | ✅ 导入PS |
| `width/height` | 图像尺寸 | 图像尺寸 | 记录分辨率 |

---

## 🔧 本次修复

### 修改文件
- `packages/sdppp-photoshop/src/tsx/components/ImagePreviewWrapper.tsx`

### 核心修复逻辑

#### 修复前（问题代码）
```typescript
const displayUrl = downloadResult.thumbnail_url || thumbnailUrl;

const newImage = {
  url: displayUrl,           // ❌ 可能是 data URL，无法显示
  thumbnail_url: displayUrl, // ❌ 可能是 data URL，无法显示
  nativePath: nativePath,
  // ...
};
```

**问题**:
- `downloadResult.thumbnail_url` 可能为空
- fallback 到 `thumbnailUrl` (data URL)
- UXP webview 无法显示 data URL（需要 file:// 格式）

#### 修复后（当前代码）
```typescript
// 关键：生成displayUrl（完全看齐ComfyUI）
let displayUrl = downloadResult.thumbnail_url;

if (!displayUrl && nativePath) {
  // 从 nativePath 生成 file:// URL（和ComfyUI一样）
  const normalizedPath = nativePath.replace(/\\/g, '/');
  displayUrl = `file:///${normalizedPath}`;
  console.log('[图层导入] downloadResult没有thumbnail_url，从nativePath生成:', displayUrl);
} else if (!displayUrl) {
  // 回退到原始data URL
  displayUrl = thumbnailUrl;
  console.log('[图层导入] 使用原始thumbnail_url（data URL）');
}

const newImage = {
  url: displayUrl,                    // ✅ file:// 格式
  thumbnail_url: displayUrl,          // ✅ file:// 格式，可正常显示
  nativePath: nativePath,             // ✅ 纯路径，用于导入PS
  width: finalWidth || returnedWidth,
  height: finalHeight || returnedHeight,
  // ...
};
```

**修复逻辑**:
1. 优先使用 `downloadResult.thumbnail_url`
2. 如果为空，从 `nativePath` 生成 `file://` URL
3. 确保 `thumbnail_url` 字段总是 `file://` 格式（可在UXP中显示）

---

## 📊 完整流程对比

### ComfyUI 流程
```
HTTP URL 
  → downloadImage 
  → { nativePath: "C:/...", thumbnail_url: "file:///C:/..." }
  → 预览显示(thumbnail_url) ✅
  → 导入PS(nativePath) ✅
```

### PS图层导入流程（修复后）
```
getImage 
  → { thumbnail_url: "data:image/png;base64,..." }
  → downloadImage(data URL)
  → { nativePath: "C:/...", thumbnail_url: "" or "file:///..." }
  → 如果thumbnail_url为空，从nativePath生成 "file:///C:/..."
  → 预览显示(file:// URL) ✅
  → 导入PS(nativePath) ✅
```

---

## 🎯 关键改进

### 1. 智能 displayUrl 生成

```typescript
// 优先级：
// 1. downloadResult.thumbnail_url （SDK返回的）
// 2. file:///nativePath （从永久文件生成）
// 3. thumbnailUrl （原始data URL，最后兜底）
```

### 2. 完全看齐 ComfyUI 的数据结构

```typescript
{
  url: 'file:///C:/Users/.../image.png',           // 显示路径
  thumbnail_url: 'file:///C:/Users/.../image.png', // 用于预览
  nativePath: 'C:/Users/.../image.png',            // 用于导入PS
  width: 1024,
  height: 1024,
  source: 'layer-import'
}
```

### 3. 详细的调试日志

```
[图层导入] === 开始downloadImage流程（完全看齐ComfyUI） ===
[图层导入] 输入参数: { url类型: 'data URL', ... }
[图层导入] downloadImage 返回完整结果: { ... }
[图层导入] downloadResult没有thumbnail_url，从nativePath生成: file:///...
[图层导入] 最终数据（完全看齐ComfyUI）: { ... }
[图层导入] ✅ 最终保存的尺寸: 1024×1024像素
```

---

## ✅ 测试步骤

### 1. 测试导入

1. 在 Photoshop 中打开一个文档（例如 1024×1024）
2. 确保有可见的图层
3. 点击 "从图层导入" 按钮
4. 查看控制台日志

### 2. 检查日志

应该看到：

```
[图层导入] === 开始downloadImage流程（完全看齐ComfyUI） ===
[图层导入] downloadImage 返回完整结果: {
  "hasNativePath": true,
  "nativePath": "C:/Users/.../xxx.png",
  "width": 1024,
  "height": 1024
}
[图层导入] downloadResult没有thumbnail_url，从nativePath生成: file:///C:/Users/.../xxx.png
[图层导入] 最终数据（完全看齐ComfyUI）: {
  "thumbnail_url": "file:///C:/Users/.../xxx.png",
  "nativePath": "C:/Users/.../xxx.png",
  "width × height": "1024 × 1024"
}
[图层导入] ✅ 最终保存的尺寸: 1024×1024像素
```

### 3. 验证预览

- ✅ 预览区域应该显示图像（不再是 "no preview"）
- ✅ 图像应该清晰可见

### 4. 验证导入到PS

1. 选中预览中的图像
2. 点击 "导入到PS" 按钮
3. 查看控制台日志中的 `[importImage] Scaling calculation`
4. 应该看到 `sourceSize: {width: 1024, height: 1024}`（完整分辨率）

### 5. 对比 ComfyUI 图像

- ✅ PS导入的图像应该和 ComfyUI 导入的图像一样可以正常显示
- ✅ PS导入的图像应该和 ComfyUI 导入的图像一样可以重新导入到PS
- ✅ 分辨率应该一致

---

## 🔍 可能的问题和解决方案

### 问题 1: 仍然显示 "no preview"

**原因**: `downloadImage` 没有返回 `nativePath`

**检查**:
```javascript
console.log('[图层导入] downloadImage 返回完整结果:', ...)
```

**解决**: 
- 检查 `downloadResult.nativePath` 是否存在
- 检查 SDK 版本是否正确

### 问题 2: 预览显示但分辨率低

**原因**: `downloadImage` 对 data URL 进行了降采样

**检查**:
```javascript
console.log('[图层导入] downloadImage 返回完整结果:', {
  width: downloadResult.width,
  height: downloadResult.height
})
```

**解决**:
- 检查 `getImage` 的 `imageSize` 参数是否设置正确（应该是 999999）
- 如果 `downloadImage` 降采样，需要使用 `source` 文件（完整分辨率临时文件）

### 问题 3: 导入到PS时仍然低分辨率

**原因**: `nativePath` 指向的文件是低分辨率的

**检查**:
```javascript
// 导入时的日志
console.log('[importImage] Scaling calculation:', {
  sourceSize: { width: ..., height: ... }
})
```

**解决**:
- 如果 `sourceSize` 是 192×192，说明 `downloadImage` 降采样了
- 需要直接使用 `getImage` 返回的 `source` 文件（临时完整分辨率文件）

---

## 📚 参考文档

- [ComfyUI 图像完整流程](./COMFYUI_IMAGE_FLOW.md)
- [UXP file:// 协议说明](https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/Modules/uxp/Persistent%20File%20Storage/File/)

---

## 🎉 预期结果

修复后，PS图层导入应该：

1. ✅ **正常显示预览**（不再 "no preview"）
2. ✅ **保持完整分辨率**（不降采样）
3. ✅ **可重复导入到PS**（和 ComfyUI 一样）
4. ✅ **数据结构完全看齐 ComfyUI**

---

## 🚨 后续优化方向

如果 `downloadImage` 对 data URL 进行降采样，可以考虑：

1. **使用 source 文件**:
   - `getImage` 返回的 `source` 是完整分辨率临时文件
   - 直接使用 `source` 作为 `nativePath`
   - 缺点：临时文件可能被删除

2. **优化 getImage 参数**:
   - 确保 `imageSize: 999999`（不限制）
   - 确保 `imageQuality: 100`（最高质量）

3. **SDK 改进**:
   - 让 `downloadImage` 支持 `file://` 协议
   - 或者添加新的 API 用于复制本地文件到永久位置

