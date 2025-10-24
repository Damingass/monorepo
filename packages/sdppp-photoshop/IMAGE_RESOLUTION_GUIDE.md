# 图像分辨率保持指南

## 问题描述

从PS图层导入图片到预览区域时，图片分辨率可能被降低。例如：
- PS画布大小：1024×1024像素
- 导入后的图片：只有约340×340像素（约1/3分辨率）

## 根本原因

图片分辨率由 `imageSize` 参数控制，该参数限制了图片的最大宽度或高度。之前使用固定值2048，但存在以下问题：

1. **固定值不够灵活**：不同用户可能有不同需求
2. **可能被用户设置覆盖**：插件有全局的最大尺寸设置
3. **未充分利用现有配置**：已有 `workBoundaryMaxSizes` 机制

## 解决方案

### 1. 使用动态最大尺寸

现在使用三级优先级来确定最大尺寸：

```typescript
// 优先级1: 当前文档的workBoundaryMaxSizes配置
const workBoundaryMaxSizes = webviewState.workBoundaryMaxSizes || {};

// 优先级2: 用户全局设置
const userSetting = sdpppSDK.stores.PhotoshopStore.getState().sdpppX?.['settings.imaging.defaultImagesSizeLimit'];

// 优先级3: 默认不限制（999999表示不限制）
const maxImageSize = workBoundaryMaxSizes[activeDocID] || userSetting || 999999;
```

### 2. 验证和日志

添加了完整的日志来追踪分辨率：

```
[图层导入] 当前状态 - activeDocID: 123, boundary: curlayer, maxImageSize: 999999
[图层导入] 调用 getImage，参数: { imageSize: 999999, ... }
[图层导入] getImage 返回数据: { width: 1024, height: 1024, ... }
[图层导入] ✅ 获取到的图片尺寸: 1024×1024像素
[图层导入] downloadImage 返回结果: { width: 1024, height: 1024, ... }
[图层导入] ✅ 分辨率保持一致: 1024×1024像素
[图层导入] 最终保存的尺寸: 1024×1024像素
```

## 如何配置最大尺寸

### 方法1：通过WorkBoundary组件

1. 点击工作区域边界按钮
2. 在弹出的对话框中设置"最大图像尺寸"
3. 该设置会保存到 `workBoundaryMaxSizes[documentID]`

### 方法2：通过插件设置

访问插件的全局设置，修改 `settings.imaging.defaultImagesSizeLimit`。

### 方法3：默认不限制

如果两者都未设置，默认使用 999999（表示不限制），保持原始分辨率。

## 分辨率限制说明

### imageSize 参数的作用

`imageSize` 限制图片的最大**宽度或高度**（取较大者）：

**示例1：正方形图片**
```
原始尺寸: 1024×1024
imageSize: 2048
结果: 1024×1024 (未超过限制，保持原样)
```

**示例2：超过限制**
```
原始尺寸: 4096×4096
imageSize: 2048
结果: 2048×2048 (按比例缩小)
```

**示例3：矩形图片**
```
原始尺寸: 3840×2160 (16:9)
imageSize: 2048
结果: 2048×1152 (保持16:9比例，长边缩小到2048)
```

**示例4：不限制**
```
原始尺寸: 8192×8192
imageSize: 999999
结果: 8192×8192 (保持原始分辨率)
```

## 常见配置推荐

### 对于游戏开发/高精度工作

```
maxImageSize: 999999 (不限制)
```
- 保持原始分辨率
- 适用于需要最高质量的场景

### 对于普通工作流

```
maxImageSize: 4096
```
- 支持4K分辨率
- 在质量和性能之间平衡

### 对于预览/快速迭代

```
maxImageSize: 2048
```
- 适合2K分辨率
- 更快的处理速度

### 对于低配置机器

```
maxImageSize: 1024
```
- 降低内存占用
- 提高响应速度

## 验证分辨率

### 1. 查看控制台日志

导入图片后，检查控制台：
```
[图层导入] ✅ 获取到的图片尺寸: 1024×1024像素
[图层导入] ✅ 分辨率保持一致: 1024×1024像素
[图层导入] 最终保存的尺寸: 1024×1024像素
```

如果看到警告：
```
[图层导入] ⚠️ 图片已被缩放，原因：超过最大尺寸限制 2048
```
说明需要增加 `maxImageSize` 设置。

### 2. 在预览中检查

预览列表中的图片会显示尺寸信息（如果添加了UI显示）。

### 3. 生成spritesheet验证

使用序列帧生成spritesheet时，控制台会显示：
```
[Spritesheet] 图片 0 加载完成，尺寸: 1024×1024
[Spritesheet] 单元格尺寸（原始分辨率）: 1024 x 1024
```

## ComfyUI图片的分辨率

ComfyUI生成的图片通过网络下载，分辨率由ComfyUI输出决定：

```
ComfyUI输出 → downloadImage → 保存为PNG → 保持原始分辨率
```

不受 `imageSize` 参数限制，始终保持ComfyUI的输出分辨率。

## 对比：PS导入 vs ComfyUI导入

### 修复前（有问题）

```
PS导入：
  getImage(imageSize: 2048) → 可能被限制
  
ComfyUI导入：
  downloadImage(url) → 保持原始分辨率

结果：分辨率可能不一致 ❌
```

### 修复后（统一）

```
PS导入：
  getImage(imageSize: 999999) → 保持原始分辨率
  downloadImage(dataURL) → 保持原始分辨率
  
ComfyUI导入：
  downloadImage(url) → 保持原始分辨率

结果：两者都保持原始分辨率 ✅
```

## 故障排查

### 问题1：图片仍然被缩小

**检查步骤：**
1. 查看控制台日志中的 `maxImageSize` 值
2. 如果不是 999999，说明被配置限制了
3. 修改WorkBoundary设置或插件全局设置

### 问题2：找不到maxImageSize设置

**解决方案：**
- 代码会自动使用默认值 999999
- 如果仍有问题，检查 `sdpppX['settings.imaging.defaultImagesSizeLimit']` 的值

### 问题3：不同文档的分辨率不一致

**原因：**
- `workBoundaryMaxSizes` 是按文档ID存储的
- 不同文档可能有不同的设置

**解决方案：**
- 为每个文档单独设置
- 或者依赖全局默认设置

## 性能考虑

### 高分辨率图片的影响

| 分辨率 | 内存占用（约） | 处理速度 | 推荐场景 |
|--------|--------------|----------|----------|
| 1024×1024 | ~4MB | 快 | 普通工作流 |
| 2048×2048 | ~16MB | 中等 | 高质量工作 |
| 4096×4096 | ~64MB | 较慢 | 4K内容制作 |
| 8192×8192 | ~256MB | 慢 | 8K/专业制作 |

### 建议

1. **根据需求选择**：不需要超高分辨率时，适当限制可以提高性能
2. **监控内存**：大量高分辨率图片会占用大量内存
3. **分批处理**：处理大量图片时，分批导入和处理

## 相关文件

- `packages/sdppp-photoshop/src/tsx/components/ImagePreviewWrapper.tsx` (第130-182行)
  - 动态获取 maxImageSize
  - 分辨率验证和日志

- `packages/sdppp-photoshop/src/providers/base/widgetable-image-mask/utils/image-operations.ts` (第48-83行)
  - 其他地方如何使用 workBoundaryMaxSizes 的参考

- `packages/sdppp-photoshop/src/providers/base/components/WorkBoundary.tsx`
  - WorkBoundary 设置界面

## 更新日期

2025-10-23

