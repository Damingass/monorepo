# ComfyUI 图像完整流程分析

## 📊 ComfyUI 图像从生成到导入PS的完整流程

### 1. ComfyUI 生成图像并返回

**位置**: `ComfyTask.ts` 第 75-82 行

```typescript
item.images.forEach((image: any) => {
    MainStore.getState().downloadAndAppendImage({
        url: image.url,  // ← HTTP URL，例如：http://127.0.0.1:8188/view?filename=xxx.png
        source: workflowName,
        docId: this.docId,
        boundary: this.boundary
    });
});
```

**关键数据**:
- `image.url`: HTTP URL 格式
- 例如：`http://127.0.0.1:8188/view?filename=ComfyUI_00001_.png`

---

### 2. downloadAndAppendImage 处理

**位置**: `App.store.ts` 第 44-112 行

#### 第一步：添加 placeholder（downloading状态）

```typescript
{
    url: 'http://127.0.0.1:8188/view?filename=xxx.png',  // 原始HTTP URL
    source: 'workflow-name',
    thumbnail_url: '',    // 初始为空
    nativePath: '',       // 初始为空
    downloading: true     // 下载中
}
```

#### 第二步：调用 downloadImage

```typescript
const res = await sdpppSDK.plugins.photoshop.downloadImage({ url })
```

**输入**: HTTP URL
**downloadImage 内部操作**:
1. 从网络下载图像文件
2. 保存到永久本地位置
3. 生成缩略图（用于显示）

**返回结果示例**:
```typescript
{
    nativePath: 'C:/Users/xxx/AppData/Local/Temp/photoshop/comfy_00001.png',
    thumbnail_url: 'file:///C:/Users/xxx/AppData/Local/Temp/photoshop/comfy_00001.png',
    width: 1024,
    height: 1024
}
```

#### 第三步：更新 placeholder 为最终数据

```typescript
{
    url: 'http://127.0.0.1:8188/view?filename=xxx.png',  // 保留原始HTTP URL
    source: 'workflow-name',
    thumbnail_url: 'file:///C:/Users/.../comfy_00001.png',  // ← 用于显示
    nativePath: 'C:/Users/.../comfy_00001.png',              // ← 用于导入PS
    width: 1024,
    height: 1024,
    downloading: false
}
```

---

### 3. 预览显示

**位置**: `ImagePreview.tsx` 第 88-102 行

```typescript
<Image
    src={images[currentIndex].thumbnail_url}  // ← 使用 thumbnail_url
    alt={`Preview ${currentIndex + 1}`}
    // ...
/>
```

**关键**: 使用 `thumbnail_url` 字段（`file://` 格式）
**结果**: ✅ 在 UXP webview 中正常显示

---

### 4. 导入到 Photoshop

**位置**: `ImagePreviewWrapper.tsx` 第 74-100 行

```typescript
const importParams = {
    nativePath: imageToSend.nativePath || imageToSend.url,  // ← 使用 nativePath
    boundary: imageToSend.boundary ?? 'canvas',
    type,
    sourceWidth: (images as any)[index]?.width,
    sourceHeight: (images as any)[index]?.height
};

const result = await sdpppSDK.plugins.photoshop.importImage(importParams);
```

**关键**: 使用 `nativePath` 字段（纯文件系统路径）
**结果**: ✅ 完整分辨率导入到PS

---

## 🔑 关键字段总结

### url
- **ComfyUI**: HTTP URL（例如：`http://127.0.0.1:8188/view?filename=xxx.png`）
- **用途**: 保存原始来源URL，方便追踪
- **不用于**: 显示或导入

### thumbnail_url
- **ComfyUI**: `file://` 格式的本地路径（由 downloadImage 生成）
- **示例**: `file:///C:/Users/xxx/AppData/Local/Temp/photoshop/comfy_00001.png`
- **用途**: ✅ 在 UXP webview 中显示预览
- **特点**: file:// 协议可以在 UXP 环境中正常渲染

### nativePath
- **ComfyUI**: 纯文件系统路径（由 downloadImage 生成）
- **示例**: `C:/Users/xxx/AppData/Local/Temp/photoshop/comfy_00001.png`
- **用途**: ✅ 导入到 Photoshop（importImage API）
- **特点**: 永久本地文件，可重复使用

### width & height
- **来源**: downloadImage 返回
- **用途**: 记录图像尺寸，用于 importImage 时的缩放计算

---

## 🎯 ComfyUI 流程的核心特点

1. **HTTP URL → 永久本地文件**:
   - `downloadImage` 将网络图像下载到本地永久位置
   - 避免临时文件被删除的问题

2. **双路径系统**:
   - `thumbnail_url` (file://): 用于显示
   - `nativePath` (纯路径): 用于导入PS

3. **分辨率保持**:
   - `downloadImage` 保持原始分辨率
   - 不进行降采样

4. **字段分离**:
   - `url`: 原始来源（HTTP）
   - `thumbnail_url`: 显示路径（file://）
   - `nativePath`: 操作路径（纯路径）

---

## 🔧 PS 图层导入应该如何看齐

PS 图层导入的核心问题：
- `getImage` 返回的 `source`/`file_token` 是**临时文件**
- 需要通过 `downloadImage` 转换为**永久文件**

### 错误方案 ❌

```typescript
// 直接使用 source（临时文件）
nativePath: imageResult.source  // ❌ 临时文件可能被删除
```

### 正确方案 ✅

```typescript
// 方案A：如果 downloadImage 支持 file:// 协议
const fileUrl = `file:///${imageResult.source}`;
const result = await downloadImage({ url: fileUrl });
// 使用 result.nativePath

// 方案B：如果 downloadImage 不支持 file://，使用 data URL
const result = await downloadImage({ url: imageResult.thumbnail_url });
// 使用 result.nativePath
```

**关键**: 
- 必须通过 `downloadImage` 获取永久 `nativePath`
- `thumbnail_url` 必须是 `file://` 或 data URL 格式才能显示

---

## 📝 当前 PS 图层导入的问题

### 症状
- 可以导入，但显示 "no preview"

### 原因分析
1. `downloadImage({ url: thumbnailUrl })` 其中 `thumbnailUrl` 是 data URL
2. `downloadResult.thumbnail_url` 可能为空或格式不正确
3. 回退到原始 `thumbnailUrl`（data URL），但没有转换为 `file://` 格式
4. ImagePreview 组件无法显示 data URL（可能需要 file:// 格式）

### 解决方案
1. 确保 `downloadResult` 返回有效的 `thumbnail_url`
2. 或者，将 `nativePath` 转换为 `file://` 格式用于显示
3. 验证 `downloadImage` 对 data URL 的处理是否正确生成永久文件

---

## 🔍 需要验证的问题

1. `downloadImage` 对 data URL 的处理是否正确？
   - 是否生成永久本地文件？
   - 返回的 `thumbnail_url` 格式是什么？

2. `downloadImage` 是否会降低分辨率？
   - 对 data URL 输入
   - 对 file:// URL 输入

3. UXP webview 是否支持 data URL 显示？
   - 或者必须是 `file://` 格式？

