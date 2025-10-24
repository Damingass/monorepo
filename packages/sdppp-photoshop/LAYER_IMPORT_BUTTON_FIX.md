# 图层导入按钮修复说明

## 问题描述

### 问题1：无法重新导入回PS图层 ❌

从PS图层导入的图片，无法再次导入回PS图层。具体表现为：
- 从ComfyUI传入的图片可以正常导入回PS ✅
- 但从PS图层导入的图片，无法重新导入回PS ❌

### 问题2：图片分辨率降低 ❌

从PS图层导入到预览区域时，图片分辨率被降低。例如：
- PS画布大小：1024×1024像素
- 导入后的图片：只有约340×340像素（约1/3分辨率）

## 根本原因

### 原因1：临时文件 vs 永久文件

**问题：**
- `getImage` 返回的 `source` 或 `file_token` 是**临时文件路径**
- 这些临时文件可能在使用后被Photoshop删除
- `importImage` 需要一个**稳定的永久路径**才能正常工作

**对比ComfyUI的工作流程：**
```
ComfyUI图片：
  网络URL → downloadImage → 保存到永久位置 → 获得稳定的nativePath → 可重复导入 ✅

PS图层图片（修复前）：
  getImage → 临时文件路径 → 文件可能被删除 → 导入失败 ❌
```

### 原因2：imageSize参数限制分辨率

**问题：**
- 之前使用固定值 `imageSize: 2048`
- 这个参数限制了图片的最大宽度或高度
- 如果画布是1024×1024，但用户设置了更低的限制，就会被缩小
- 固定值不够灵活，无法适应不同的用户需求和配置

## 解决方案

### 修复1：使用 downloadImage + thumbnail_url 获取永久路径

**核心思路：**

1. `getImage` 返回 `thumbnail_url`（base64编码的data URL）
2. 将这个data URL传给 `downloadImage`
3. `downloadImage` 解码并保存为永久文件
4. 获得稳定的 `nativePath`，就像ComfyUI的图片一样

**实现代码**（ImagePreviewWrapper.tsx 第184-258行）：

```typescript
// 1. 获取图层数据（包含thumbnail_url，这是data URL）
const imageResult = await sdpppSDK.plugins.photoshop.getImage(getImageParams);

const thumbnailUrl = imageResult.thumbnail_url;
if (!thumbnailUrl) {
  console.error('[图层导入] 没有thumbnail_url，无法保存图片');
  alert('无法获取图片数据，请确保图层可见');
  return;
}

// 2. 关键修复：使用downloadImage保存到永久位置（就像ComfyUI那样）
const downloadResult = await sdpppSDK.plugins.photoshop.downloadImage({ 
  url: thumbnailUrl  // 传入data URL
});

if ('error' in downloadResult && downloadResult.error) {
  console.error('[图层导入] 下载失败:', downloadResult.error);
  alert(`保存失败: ${downloadResult.error}`);
  return;
}

// 3. 现在我们有了永久的nativePath，就像ComfyUI的图片一样
const nativePath = downloadResult.nativePath;
const displayUrl = downloadResult.thumbnail_url || thumbnailUrl;
const finalWidth = downloadResult.width;
const finalHeight = downloadResult.height;

if (!nativePath) {
  console.error('[图层导入] downloadImage没有返回nativePath');
  alert('保存图片失败');
  return;
}

// 4. 添加到预览列表，使用永久路径
const newImage = {
  url: displayUrl,
  thumbnail_url: displayUrl,
  nativePath: nativePath,  // 永久路径，可以重复使用 ✅
  source: 'layer-import',
  docId: activeDocID,
  boundary: boundary,
  width: finalWidth || returnedWidth,
  height: finalHeight || returnedHeight,
  downloading: false
};

MainStore.setState({ previewImageList: [...currentList, newImage] });
```

**工作流程对比：**

```
ComfyUI图片：
  网络URL 
  → downloadImage 
  → 保存为PNG 
  → 永久nativePath 
  → 可重复导入 ✅

PS图层图片（现在）：
  getImage 
  → thumbnail_url (data URL)
  → downloadImage 
  → 保存为PNG 
  → 永久nativePath 
  → 可重复导入 ✅

结果：两者完全一致！
```

### 修复2：使用动态 imageSize 保持原始分辨率

**核心思路：**

使用三级优先级来确定最大尺寸，而不是固定值：

**实现代码**（ImagePreviewWrapper.tsx 第130-146行）：

```typescript
// 获取最大尺寸限制（三级优先级）
const workBoundaryMaxSizes = webviewState.workBoundaryMaxSizes || {};

const maxImageSize = 
  workBoundaryMaxSizes[activeDocID] ||                      // 优先级1：文档级配置
  sdpppSDK.stores.PhotoshopStore.getState().sdpppX?.        // 优先级2：用户全局设置
    ['settings.imaging.defaultImagesSizeLimit'] || 
  999999;                                                    // 优先级3：默认不限制

console.log('[图层导入] maxImageSize:', maxImageSize);

// 使用动态参数调用 getImage
const getImageParams = {
  boundary: boundary,
  content: 'curlayer',
  imageSize: maxImageSize,  // ✅ 动态值，默认999999（不限制）
  imageQuality: 90,
  cropBySelection: 'no' as const,
  SkipNonNormalLayer: true
};
```

**对比：**

```
修复前（固定值）：
  imageSize: 2048  // ❌ 固定，可能不足或过大

修复后（动态值）：
  imageSize: workBoundaryMaxSizes || userSetting || 999999  // ✅ 灵活，默认不限制
```

**效果：**

- 如果用户没有设置限制：使用 999999（不限制），保持原始分辨率
- 如果用户设置了限制：遵守用户设置
- 完全兼容现有的配置系统

### 验证和日志

添加了完整的日志来验证分辨率：

```typescript
// 验证分辨率
const returnedWidth = (imageResult as any)?.width;
const returnedHeight = (imageResult as any)?.height;

if (returnedWidth && returnedHeight) {
  console.log(`[图层导入] ✅ 获取到的图片尺寸: ${returnedWidth}×${returnedHeight}像素`);
  
  if (maxImageSize < 999999 && (returnedWidth > maxImageSize || returnedHeight > maxImageSize)) {
    console.warn(`[图层导入] ⚠️ 图片已被缩放，原因：超过最大尺寸限制 ${maxImageSize}`);
  }
}

// 验证分辨率是否保持一致
if (returnedWidth && returnedHeight && finalWidth && finalHeight) {
  if (returnedWidth === finalWidth && returnedHeight === finalHeight) {
    console.log(`[图层导入] ✅ 分辨率保持一致: ${finalWidth}×${finalHeight}像素`);
  } else {
    console.warn(`[图层导入] ⚠️ 分辨率发生变化: ${returnedWidth}×${returnedHeight} → ${finalWidth}×${finalHeight}`);
  }
}

console.log(`[图层导入] 最终保存的尺寸: ${newImage.width}×${newImage.height}像素`);
```

**控制台输出示例：**

```
[图层导入] 当前状态 - activeDocID: 123, boundary: curlayer, maxImageSize: 999999
[图层导入] 调用 getImage，参数: { imageSize: 999999, imageQuality: 90, ... }
[图层导入] getImage 返回数据: { width: 1024, height: 1024, ... }
[图层导入] ✅ 获取到的图片尺寸: 1024×1024像素
[图层导入] 使用thumbnail_url下载到永久位置
[图层导入] downloadImage 返回结果: { nativePath: "...", width: 1024, height: 1024 }
[图层导入] ✅ 分辨率保持一致: 1024×1024像素
[图层导入] 最终保存的尺寸: 1024×1024像素
[图层导入] 导入成功！
```

## 其他修复

### 修复图片类型判断

在第47-48行：

```typescript
// 从图层导入的图片默认认为是图片类型，即使URL可能没有扩展名
const isCurrentItemImage = currentItem ? 
  (currentItem.source === 'layer-import' || isImage(currentItem.url)) : 
  false;
```

**说明：**
- 如果 `source === 'layer-import'`，直接认为是图片
- 确保"导入到PS"按钮正常显示

### 增强错误处理

```typescript
// 在 sendToPSAtIndex 函数中
if (!importParams.nativePath) {
  const errorMsg = '图像路径为空，无法导入';
  console.error('[导入到PS]', errorMsg);
  alert(errorMsg);
  return;
}

console.log('[导入到PS] 开始导入:', { 
  index, 
  source, 
  nativePath: importParams.nativePath,
  type: type 
});

const result = await sdpppSDK.plugins.photoshop.importImage(importParams);
console.log('[导入到PS] 导入成功！');
```

## 技术细节

### downloadImage 的工作原理

`downloadImage` 可以处理三种URL格式：

1. **HTTP(S) URL**：
   ```typescript
   downloadImage({ url: 'https://example.com/image.png' })
   // → 下载网络图片 → 保存为本地文件
   ```

2. **Data URL**（我们使用的）：
   ```typescript
   downloadImage({ url: 'data:image/png;base64,...' })
   // → 解码base64 → 保存为本地文件
   ```

3. **不支持 file:// URL**：
   ```typescript
   downloadImage({ url: 'file:///C:/temp/image.png' })
   // ❌ 会报错: "network request failed"
   ```

### imageSize 参数的作用

`imageSize` 限制图片的最大**宽度或高度**（取较大者）：

**示例：**

| 原始尺寸 | imageSize | 结果尺寸 | 说明 |
|---------|-----------|---------|------|
| 1024×1024 | 2048 | 1024×1024 | 未超过限制，保持原样 ✅ |
| 1024×1024 | 999999 | 1024×1024 | 不限制，保持原样 ✅ |
| 4096×4096 | 2048 | 2048×2048 | 超过限制，按比例缩小 |
| 3840×2160 | 2048 | 2048×1152 | 长边缩小到2048，保持16:9比例 |
| 8192×8192 | 999999 | 8192×8192 | 不限制，保持原样 ✅ |

**默认值 999999 的含义：**
- 999999 是一个足够大的数字，实际上不会限制任何合理尺寸的图片
- 相当于"不限制"的意思
- 这样可以保持图片的原始分辨率

## 测试验证

### 测试步骤

1. **准备测试图层**：
   - 创建一个1024×1024的画布
   - 添加一个图层并绘制内容

2. **导入测试**：
   ```
   点击"从图层导入" → 检查控制台日志
   ```
   
   应该看到：
   ```
   [图层导入] ✅ 获取到的图片尺寸: 1024×1024像素
   [图层导入] ✅ 分辨率保持一致: 1024×1024像素
   ```

3. **重新导入测试**：
   ```
   在预览列表中选择刚导入的图片 → 点击"导入到PS"
   ```
   
   应该看到：
   ```
   [导入到PS] 开始导入: { nativePath: "...", type: "newdoc" }
   [导入到PS] 导入成功！
   ```

4. **Spritesheet测试**：
   ```
   添加多个图片到序列帧 → 生成2×2的spritesheet
   ```
   
   应该看到：
   ```
   [Spritesheet] 图片 0 加载完成，尺寸: 1024×1024
   [Spritesheet] Canvas总尺寸（原始分辨率）: 2048 x 2048
   ```

### 预期结果

- ✅ PS导入的图片可以重新导入回PS
- ✅ 图片分辨率保持1024×1024（不会降低到340×340）
- ✅ 与ComfyUI图片的行为完全一致
- ✅ Spritesheet生成保持原始分辨率（2×2布局 = 2048×2048）

## 相关文档

- **IMAGE_RESOLUTION_GUIDE.md**：详细的分辨率配置和验证指南
- **SPRITESHEET_FEATURE.md**：Spritesheet功能说明，包含分辨率处理
- **SEQUENCE_PLAYER_GUIDE.md**：序列帧播放器使用指南

## 修改文件

- `packages/sdppp-photoshop/src/tsx/components/ImagePreviewWrapper.tsx`
  - 第130-183行：动态获取maxImageSize，分辨率验证
  - 第184-258行：使用downloadImage获取永久路径
  - 第47-48行：图片类型判断修复
  - 第66-111行：增强的错误处理

## 更新日期

2025-10-24

## 总结

**核心修复：**

1. **临时文件 → 永久文件**：使用 `downloadImage(thumbnail_url)` 代替直接使用临时路径
2. **固定限制 → 动态配置**：使用 `workBoundaryMaxSizes` 或 `999999`（不限制）代替固定的 `2048`

**结果：**

- ✅ PS导入的图片可以重复导入，就像ComfyUI图片一样
- ✅ 图片分辨率保持原样，不会被降低
- ✅ 完全兼容现有的配置系统
- ✅ 详细的日志帮助用户验证和调试

**工作流程现在完全统一：**

```
PS图层 ──┐
         ├─→ downloadImage → 永久文件 → nativePath → 可重复导入 ✅
ComfyUI ─┘                    (保持原始分辨率)
```
