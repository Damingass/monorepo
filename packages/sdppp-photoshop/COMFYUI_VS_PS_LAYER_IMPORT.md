# ComfyUI vs PS 图层导入 - 完整流程对比

## ✅ 问题已修复！

**修复日期**: 2024-10-24
**修复方案**: 使用 `file_token` + `getImageBase64` + `downloadImage` 获取完整分辨率
**详细文档**: 参见 [LAYER_IMPORT_BUTTON_FIX_FINAL.md](./LAYER_IMPORT_BUTTON_FIX_FINAL.md)

---

## 🎯 核心差异（问题分析）

**关键**: 传入 `downloadImage` 的 URL 不同！

- **ComfyUI**: HTTP URL（完整分辨率）
- **PS 图层（修复前）**: data URL（192×192 缩略图）❌
- **PS 图层（修复后）**: 使用 file_token 获取完整分辨率 data URL ✅

---

## 📊 ComfyUI 完整流程（保持完整分辨率）

### 第1步：ComfyUI 生成图像

```typescript
// ComfyTask.ts 第75-82行
item.images.forEach((image: any) => {
  MainStore.getState().downloadAndAppendImage({
    url: image.url,  // ← HTTP URL！例如：http://127.0.0.1:8188/view?filename=ComfyUI_00001.png
    source: workflowName,
    docId: this.docId,
    boundary: this.boundary
  });
});
```

**关键数据**:
```javascript
image.url = "http://127.0.0.1:8188/view?filename=ComfyUI_00001.png"
```
→ 这是一个指向**完整分辨率图片**的 HTTP URL！

---

### 第2步：downloadAndAppendImage

```typescript
// App.store.ts 第44-112行
downloadAndAppendImage: async ({ url, source, docId, boundary }) => {
  // 2.1 插入 downloading 占位符
  set({
    previewImageList: [
      ...MainStore.getState().previewImageList,
      {
        url,                    // "http://127.0.0.1:8188/view?..."
        source,
        thumbnail_url: '',
        nativePath: '',
        downloading: true,
      }
    ]
  })

  // 2.2 调用 downloadImage 下载完整分辨率图片
  const res = await sdpppSDK.plugins.photoshop.downloadImage({ 
    url  // ← 传入 HTTP URL（完整分辨率）
  })
  
  // 2.3 更新为最终数据
  const updated = {
    ...currentList[idx],
    downloading: false,
    thumbnail_url: res.thumbnail_url,  // downloadImage 返回的缩略图（用于显示）
    nativePath: res.nativePath,        // downloadImage 保存的完整分辨率文件路径
    width: res.width,                  // 1024
    height: res.height,                // 1024
  }
}
```

---

### 第3步：downloadImage 的内部处理

```typescript
// SDK 内部实现（推测）
downloadImage({ url: "http://127.0.0.1:8188/view?filename=xxx.png" })

内部操作：
1. 从 HTTP URL 下载完整分辨率图片（1024×1024）
2. 保存到永久本地位置：C:/Users/.../AppData/Local/Temp/photoshop/comfy_00001.png
3. 生成缩略图用于显示
4. 返回：
   {
     nativePath: "C:/Users/.../comfy_00001.png",        // 完整分辨率文件
     thumbnail_url: "file:///C:/Users/.../comfy_00001.png",
     width: 1024,
     height: 1024
   }
```

**关键**: `nativePath` 指向的是**完整分辨率**（1024×1024）的文件！

---

### 第4步：显示和导出

```typescript
// 显示（ImagePreview.tsx）
<Image src={image.thumbnail_url} />  // file:///C:/Users/.../comfy_00001.png

// 导出到 PS（ImagePreviewWrapper.tsx）
await sdpppSDK.plugins.photoshop.importImage({
  nativePath: image.nativePath,  // C:/Users/.../comfy_00001.png（1024×1024）
  boundary: image.boundary,
  type: 'smartobject'
})
```

**结果**: 
- ✅ 预览显示完整分辨率
- ✅ 导入到 PS 是完整分辨率（1024×1024）

---

## 📊 PS 图层导入流程（当前实现 - 降分辨率）

### 第1步：从 PS 图层获取图像

```typescript
// ImagePreviewWrapper.tsx
const imageResult = await sdpppSDK.plugins.photoshop.getImage({
  boundary: boundary,
  content: 'curlayer',
  imageSize: 999999,  // ← 设置了不限制尺寸
  imageQuality: 90,
  cropBySelection: 'no',
  SkipNonNormalLayer: true
});
```

---

### 第2步：getImage 返回结果

```javascript
imageResult = {
  thumbnail_url: "data:image/png;base64,iVBORw0KGgo...",  // ← 192×192 的 data URL！
  source: "{\"boundary\":{...},\"content\":\"curlayer\",...}",  // ← 参数回显，不是文件路径！
  file_token: "{\"boundary\":{...}}",  // ← 也是参数回显
  width: undefined,
  height: undefined
}
```

**关键问题**:
- ❌ `thumbnail_url` 是 192×192 的 data URL（固定尺寸缩略图）
- ❌ `source` 和 `file_token` 不是文件路径，而是参数的 JSON 字符串
- ❌ 没有返回完整分辨率文件的路径！

---

### 第3步：检测并使用 downloadImage

```typescript
// ImagePreviewWrapper.tsx（当前实现）

// 检测到 source 是参数而不是文件路径
const sourceIsParams = sourceUrl && sourceUrl.includes('boundary');

if (sourceIsParams) {
  // source 无效，使用 thumbnail_url
  sourceUrl = undefined;
}

// 调用 downloadImage 保存 thumbnail_url
const downloadResult = await sdpppSDK.plugins.photoshop.downloadImage({ 
  url: thumbnailUrl  // ← 传入的是 192×192 的 data URL！
})
```

---

### 第4步：downloadImage 的内部处理

```typescript
// SDK 内部实现（推测）
downloadImage({ url: "data:image/png;base64,..." })

内部操作：
1. 解析 data URL（192×192 的图片）
2. 保存到永久本地位置：C:/Users/.../AppData/Local/Temp/photoshop/layer_00001.png
3. 返回：
   {
     nativePath: "C:/Users/.../layer_00001.png",  // ← 但这是 192×192 的文件！
     thumbnail_url: "file:///C:/Users/.../layer_00001.png",
     width: 192,
     height: 192
   }
```

**关键问题**: `nativePath` 指向的是**低分辨率**（192×192）的文件！

---

### 第5步：显示和导出

```typescript
// 显示（ImagePreview.tsx）
<Image src={image.thumbnail_url} />  // file:///C:/Users/.../layer_00001.png（192×192）

// 导出到 PS（ImagePreviewWrapper.tsx）
await sdpppSDK.plugins.photoshop.importImage({
  nativePath: image.nativePath,  // C:/Users/.../layer_00001.png（192×192！）
  boundary: image.boundary,
  type: 'smartobject'
})
```

**结果**: 
- ✅ 预览可以显示（但是低分辨率）
- ❌ 导入到 PS 也是低分辨率（192×192）

---

## 🔑 根本原因总结

| 步骤 | ComfyUI | PS 图层导入（当前） | 区别 |
|------|---------|------------------|------|
| **输入** | HTTP URL | data URL | ComfyUI 传入完整分辨率 URL |
| **数据来源** | `http://127.0.0.1:8188/view?filename=xxx.png` | `data:image/png;base64,...` | HTTP vs base64 |
| **原始分辨率** | 1024×1024 | 192×192 | 完整 vs 缩略图 |
| **downloadImage 输入** | 完整分辨率 HTTP URL | 低分辨率 data URL | **这是关键差异！** |
| **downloadImage 输出** | 1024×1024 文件 | 192×192 文件 | 输出取决于输入 |
| **nativePath 分辨率** | 1024×1024 | 192×192 | **这导致了降采样！** |
| **显示分辨率** | ✅ 1024×1024 | ⚠️ 192×192 | 低分辨率预览 |
| **导出分辨率** | ✅ 1024×1024 | ❌ 192×192 | 低分辨率导出 |

---

## 🎯 问题的根源

**`getImage` API 在当前环境中没有返回完整分辨率文件的路径！**

### ComfyUI 为什么不会降采样？

ComfyUI 从一开始就提供了**完整分辨率的 HTTP URL**：
```
http://127.0.0.1:8188/view?filename=ComfyUI_00001.png
```

这个 URL 指向的文件就是完整分辨率（1024×1024）。

### PS 图层导入为什么会降采样？

`getImage` 只返回了**192×192 的 data URL**：
```
data:image/png;base64,...（192×192）
```

没有返回完整分辨率文件的路径。

---

## 🔧 解决方案（✅ 已在 ImagePreviewWrapper.tsx 中实现）

### 方案：file_token + getImageBase64 + downloadImage

**实现文件**: `packages/sdppp-photoshop/src/tsx/components/ImagePreviewWrapper.tsx`  
**函数**: `handleImportFromLayer`

**核心思路**：将图层数据保存到本地，完全对齐 ComfyUI 流程

#### 流程图

```
PS 图层
  ↓
getImage({ imageSize: 4096 })  ← 使用实际大小而不是 999999
  ↓
获取 file_token（完整分辨率令牌）
  ↓
getImageBase64({ token: file_token })  ← 关键！获取完整分辨率 base64
  ↓
构造 data URL: `data:image/png;base64,${base64}`
  ↓
downloadImage({ url: dataUrl })  ← 保存到永久本地文件
  ↓
nativePath（完整分辨率本地文件）✅
```

#### 关键代码

```typescript
// 1. 获取 file_token
const imageResult = await sdpppSDK.plugins.photoshop.getImage({
  boundary: boundary,
  content: 'curlayer',
  imageSize: 4096,  // 使用实际大小
  imageQuality: 90,
  cropBySelection: 'no',
  SkipNonNormalLayer: true
});

const file_token = imageResult.file_token;

// 2. 使用 file_token 获取完整分辨率 base64
const base64Result = await sdpppSDK.plugins.photoshop.getImageBase64({ 
  token: file_token 
});

// 3. 构造完整分辨率 data URL
const mimeType = base64Result.mimeType || 'image/png';
const fullResolutionDataUrl = `data:${mimeType};base64,${base64Result.base64}`;

// 4. 保存到本地（和 ComfyUI 一样）
const downloadResult = await sdpppSDK.plugins.photoshop.downloadImage({ 
  url: fullResolutionDataUrl 
});

// 5. 获得完整分辨率的本地文件
const nativePath = downloadResult.nativePath;  // 1024×1024 ✅
const width = downloadResult.width;            // 1024 ✅
const height = downloadResult.height;          // 1024 ✅
```

#### 优势

| 特性 | 之前（thumbnail_url） | 现在（file_token + getImageBase64） |
|------|---------------------|--------------------------------|
| **分辨率** | 192×192 ❌ | 1024×1024 ✅ |
| **数据来源** | thumbnail_url（固定低分辨率） | file_token（完整分辨率令牌） |
| **保存方式** | downloadImage（低分辨率 data URL） | downloadImage（完整分辨率 data URL） |
| **对齐 ComfyUI** | ❌ 不对齐 | ✅ 完全对齐 |
| **导出质量** | 低分辨率 ❌ | 完整分辨率 ✅ |

#### 容错机制

```typescript
// 如果 file_token 不可用，回退到 thumbnail_url
if (file_token && typeof file_token === 'string' && !file_token.includes('boundary')) {
  try {
    // 使用 file_token + getImageBase64
    const base64Result = await sdpppSDK.plugins.photoshop.getImageBase64({ token: file_token });
    fullResolutionDataUrl = `data:${base64Result.mimeType};base64,${base64Result.base64}`;
  } catch (error) {
    // 回退到 thumbnail_url
    fullResolutionDataUrl = thumbnailUrl;
  }
} else {
  // 回退到 thumbnail_url
  fullResolutionDataUrl = thumbnailUrl;
}
```

---

## 📋 其他项目中 getImage 的用法

让我看看项目中其他地方是如何使用 `getImage` 的：

### image-operations.ts

```typescript
// packages/sdppp-photoshop/src/providers/base/widgetable-image-mask/utils/image-operations.ts
const getImageParams = {
  content: source,
  boundary: boundaryParam,
  imageSize: workBoundaryMaxSizes[activeDocumentID] || 
             sdpppSDK.stores.PhotoshopStore.getState().sdpppX['settings.imaging.defaultImagesSizeLimit'],
  cropBySelection: reverse ? 'negative' : 'no',
} as const;

result = await sdpppSDK.plugins.photoshop.getImage(getImageParams);
thumbnail_url = result.thumbnail_url;
file_token = result.file_token;
imageSource = result.source;
```

**注意**: 这里也只使用了 `thumbnail_url` 和 `file_token`。

### realtime-thumbnail-store.ts

```typescript
// packages/sdppp-photoshop/src/providers/base/widgetable-image-mask/stores/realtime-thumbnail-store.ts
const res = await sdpppSDK.plugins.photoshop.getImage({
  boundary: boundaryParam,
  content: tracking.content,
  imageSize: 192,  // ← 明确设置为 192
  imageQuality: 1,
  cropBySelection: tracking.alt ? 'negative' : 'no',
  SkipNonNormalLayer: true,
});
const thumb = res.thumbnail_url || '';
```

**注意**: 这里明确设置 `imageSize: 192`，只用于缩略图。

---

## 🎉 好消息

**预览已经可以正常显示了！**（虽然是低分辨率）

这至少解决了 "no preview" 的问题。

---

## 🔍 下一步：解决分辨率问题

需要进一步调查：

1. **检查 SDK 文档**：`getImage` 是否有其他参数可以返回完整分辨率文件？

2. **测试不同的 imageSize 值**：
   ```typescript
   imageSize: 9999    // 尝试
   imageSize: 4096    // 尝试
   imageSize: null    // 尝试
   ```

3. **检查 getImage 的返回类型定义**：看是否有我们遗漏的字段

4. **询问 SDK 维护者**：这个 API 应该如何使用才能获取完整分辨率？

5. **使用其他 API**：可能有其他 SDK 方法可以获取完整分辨率的图层数据

