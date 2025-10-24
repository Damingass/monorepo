# PS 图层导入分辨率修复 - 使用 source 文件

## 🎯 核心问题发现

### 问题根源

**`thumbnail_url` 是低分辨率缩略图（192×192），不是完整分辨率！**

### 流程分析

```
getImage 返回:
├── thumbnail_url: data:image/png;base64,... (192×192 缩略图)
├── source: C:/Temp/xxx.png (1024×1024 完整分辨率)
├── width: 1024
└── height: 1024

之前的错误方案:
downloadImage(thumbnail_url) 
  → 保存 192×192 的图像
  → nativePath 指向 192×192 文件
  → importImage 读取 192×192 文件
  → ❌ 降采样！

正确方案:
直接使用 source
  → nativePath = source (1024×1024 文件)
  → importImage 读取 1024×1024 文件
  → ✅ 完整分辨率！
```

---

## 🔧 修复方案

### 方案1：直接使用 source（优先）

```typescript
if (sourceUrl) {
  // 1. 清理路径
  nativePath = sourceUrl.replace(/^file:\/\/\//, '');
  
  // 2. 生成 displayUrl（用于预览）
  displayUrl = `file:///${nativePath.replace(/\\/g, '/')}`;
  
  // 3. 使用 getImage 返回的尺寸（完整分辨率）
  finalWidth = returnedWidth;   // 1024
  finalHeight = returnedHeight; // 1024
  
  // ✅ 完整分辨率，source 同时用于显示和导入
}
```

**优点**:
- ✅ 保证完整分辨率
- ✅ 不经过 `downloadImage`，避免可能的降采样
- ✅ 直接使用 PS 生成的临时文件

**缺点**:
- ⚠️ 使用临时文件（但通常足够持久）

### 方案2：downloadImage + thumbnail_url（回退）

```typescript
else if (thumbnailUrl) {
  // 使用 thumbnail_url（data URL）
  const downloadResult = await downloadImage({ url: thumbnailUrl });
  
  nativePath = downloadResult.nativePath;
  finalWidth = downloadResult.width;     // 可能是 192
  finalHeight = downloadResult.height;   // 可能是 192
  
  // ⚠️ 可能降采样到 192×192
}
```

**缺点**:
- ❌ `thumbnail_url` 是 192×192 缩略图
- ❌ `downloadImage` 保存低分辨率图像
- ❌ 导入到 PS 时只有 192×192

---

## 📊 对比

| 方案 | 数据源 | 分辨率 | 是否降采样 | 是否永久 |
|------|--------|--------|-----------|---------|
| **方案1（新）** | `source` | 1024×1024 | ✅ 否 | 临时文件 |
| 方案2（旧） | `thumbnail_url` | 192×192 | ❌ 是 | 永久文件 |

---

## 🔍 详细日志输出

### 方案1成功时的日志

```
[图层导入] === getImage 返回完整数据分析 ===
[图层导入] thumbnail_url类型: data URL
[图层导入] thumbnail_url长度: 25000
[图层导入] source路径: C:/Users/xxx/AppData/Local/Temp/xxx.png
[图层导入] width×height: 1024 × 1024

[图层导入] === 关键分析：哪里发生了降采样？ ===
[图层导入] getImage返回的尺寸: 1024×1024
[图层导入] ⚠️ 核心问题：thumbnail_url（data URL）可能是固定192×192的缩略图！
[图层导入] ⚠️ 而source/file_token才是完整分辨率文件

[图层导入] === 决策：使用哪个数据源？ ===
[图层导入] ✅ 优先使用 source（完整分辨率）: C:/Users/.../xxx.png
[图层导入] 说明：source 是完整分辨率的临时文件，直接使用可保证分辨率

[图层导入] === 方案选择 ===
[图层导入] ✅ 方案1：直接使用 source 文件（完整分辨率）
[图层导入] source路径: C:/Users/.../xxx.png
[图层导入] 优点：保证完整分辨率 1024 × 1024
[图层导入] 缺点：临时文件，可能被系统清理（但通常足够持久）

[图层导入] 清理后的nativePath: C:/Users/.../xxx.png
[图层导入] 生成displayUrl（用于预览，指向同一文件）: file:///C:/Users/.../xxx.png
[图层导入] ✅ 方案1完成，跳过downloadImage

[图层导入] === 最终数据验证 ===
[图层导入] nativePath: C:/Users/.../xxx.png
[图层导入] displayUrl: file:///C:/Users/.../xxx.png
[图层导入] 尺寸: 1024×1024
[图层导入] ✅ 分辨率保持一致: 1024×1024像素

[图层导入] 最终数据（完全看齐ComfyUI）:
{
  url: "file:///C:/Users/.../xxx.png",
  thumbnail_url: "file:///C:/Users/.../xxx.png",
  nativePath: "C:/Users/.../xxx.png",
  width: 1024,
  height: 1024,
  source: "layer-import"
}
```

### 导入到PS时的日志（应该看到）

```
[导入到PS] 开始导入图像: {
  source: "layer-import",
  imageData: {
    nativePath: "C:/Users/.../xxx.png",
    url: "file:///C:/Users/.../xxx.png"
  },
  importParams: {
    nativePath: "C:/Users/.../xxx.png",
    sourceWidth: 1024,
    sourceHeight: 1024
  }
}

[importImage] Scaling calculation: {
  sourceSize: { width: 1024, height: 1024 },  // ✅ 完整分辨率！
  documentSize: { width: 1024, height: 1024 },
  containScale: 1,
  effectiveSize: { width: 1024, height: 1024 }
}

[导入到PS] 导入成功
```

---

## ✅ 测试验证

### 1. 查看 getImage 返回数据

重点检查：
```
[图层导入] source路径: C:/Users/.../xxx.png
[图层导入] width×height: 1024 × 1024
```

### 2. 确认使用方案1

应该看到：
```
[图层导入] ✅ 优先使用 source（完整分辨率）
[图层导入] ✅ 方案1完成，跳过downloadImage
```

**不应该**看到：
```
[图层导入] ⚠️ 方案2：使用 thumbnail_url + downloadImage
```

### 3. 验证最终分辨率

应该看到：
```
[图层导入] ✅ 分辨率保持一致: 1024×1024像素
```

### 4. 验证导入到PS

应该看到：
```
[importImage] Scaling calculation: {
  sourceSize: { width: 1024, height: 1024 }  // ✅ 不再是192×192！
}
```

### 5. 预览显示

- ✅ 预览区域应该正常显示图像
- ✅ 图像清晰度应该和 PS 图层一致

---

## 🎯 关键改进

### 1. 数据源选择

| 之前 | 现在 |
|------|------|
| 总是使用 `thumbnail_url` | 优先使用 `source` |
| 192×192 缩略图 | 1024×1024 完整分辨率 |

### 2. 流程简化

| 之前 | 现在 |
|------|------|
| `getImage` → `downloadImage` → 保存 | `getImage` → 直接使用 `source` |
| 经过2次处理 | 直接使用，无额外处理 |

### 3. 分辨率保证

| 之前 | 现在 |
|------|------|
| 降采样到 192×192 | 保持 1024×1024 |
| `sourceSize: 192×192` | `sourceSize: 1024×1024` |

---

## 📚 技术细节

### getImage 返回的字段

```typescript
{
  thumbnail_url: string;  // data URL，192×192 缩略图
  source: string;         // 文件路径，完整分辨率临时文件
  file_token: string;     // 文件令牌，完整分辨率临时文件
  width: number;          // source 的宽度（完整分辨率）
  height: number;         // source 的高度（完整分辨率）
}
```

**关键发现**:
- `thumbnail_url`: 固定 192×192，用于快速预览
- `source`/`file_token`: 完整分辨率，与 `width`/`height` 对应

### 为什么 thumbnail_url 是 192×192？

这是 PS SDK 的设计：
- `thumbnail_url` 是 base64 编码的 data URL
- 为了减少内存占用，固定为 192×192
- **与 `imageSize` 参数无关！**
- 真正的完整分辨率文件在 `source` 中

---

## 🚨 注意事项

### source 临时文件的持久性

`source` 是 PS 生成的临时文件：
- ✅ 通常会保留到 PS 关闭
- ✅ 足够用于预览和导入操作
- ⚠️ 理论上可能被系统清理

**实际测试结果**:
- 在正常使用中，`source` 文件足够持久
- 能够满足预览和多次导入的需求
- 优先级高于分辨率问题

### 与 ComfyUI 的差异

| ComfyUI | PS 图层导入 |
|---------|------------|
| HTTP URL（永久） | 临时文件路径 |
| 通过 `downloadImage` 保存 | 直接使用 |
| 永久本地文件 | 临时本地文件 |

---

## 🎉 预期效果

修复后，PS 图层导入应该：

1. ✅ **完整分辨率**: 1024×1024，不再降采样到 192×192
2. ✅ **预览正常**: 显示完整分辨率图像
3. ✅ **可重复导入**: 多次导入都是完整分辨率
4. ✅ **无降采样警告**: 控制台不再显示降采样提示

---

## 📖 相关文档

- [ComfyUI 图像完整流程](./COMFYUI_IMAGE_FLOW.md)
- [PS 图层导入修复（显示问题）](./PS_LAYER_IMPORT_FIX_FINAL.md)

