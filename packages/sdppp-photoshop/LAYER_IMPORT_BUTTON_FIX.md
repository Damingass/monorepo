# 图层导入按钮修复说明

## 问题描述

从PS图层导入的图片，无法再次导入回PS图层。具体表现为：
- 从ComfyUI传入的图片可以正常导入回PS ✅
- 但从PS图层导入的图片，无法重新导入回PS ❌

## 根本原因

经过深入分析和多次尝试，发现真正的问题是**路径格式不匹配**：

### 路径格式问题

- `getImage` 返回的 `source` 或 `file_token` 可能是 **`file://` 协议URL**（如 `file:///C:/Users/...`）
- `importImage` 的 `nativePath` 参数需要 **纯文件系统路径**（如 `C:/Users/...` 或 `C:\Users\...`）
- 如果直接把 `file://` URL传给 `importImage`，会导致导入失败

### 为什么不能用 downloadImage

最初尝试使用 `downloadImage` 来"下载"本地文件，但这个方案失败了，因为：
- `downloadImage` 是设计用来从**网络URL**下载图片的
- 它**不支持** `file://` 协议
- 尝试传入 `file://` URL会导致 "network request failed" 错误

## 解决方案

### 核心修复：直接使用路径并正确转换格式

**关键代码修改**（第154-207行）：

```typescript
// 核心修复：直接使用 source 或 file_token 作为 nativePath
// 但需要正确处理路径格式（去掉file://前缀，确保是纯文件系统路径）
let rawPath = imageResult.source || imageResult.file_token || '';
let nativePath = rawPath;

// 处理路径格式
if (rawPath.startsWith('file://')) {
  // 去掉 file:// 前缀: file:///C:/Users/... -> C:/Users/...
  nativePath = rawPath.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
  console.log('[图层导入] 去掉file://前缀:', { rawPath, nativePath });
}

console.log('[图层导入] 最终路径:', {
  rawPath,
  nativePath,
  isFilePath: nativePath && !nativePath.startsWith('http') && !nativePath.startsWith('data:')
});

// 用于显示的URL（保持或转换为file:// URL，用于UXP webview）
let displayUrl = imageResult.thumbnail_url || '';
if (!displayUrl && rawPath) {
  if (rawPath.startsWith('file://')) {
    displayUrl = rawPath;
  } else if (rawPath.startsWith('data:')) {
    displayUrl = rawPath;
  } else {
    displayUrl = `file:///${rawPath.replace(/\\/g, '/')}`;
  }
}

const newImage = {
  url: displayUrl,           // 用于显示（file:// 或 data: URL）
  thumbnail_url: displayUrl,
  nativePath: nativePath,    // 用于导入（纯文件系统路径）
  source: 'layer-import',
  ...
};
```

**修改说明：**
1. 直接使用 `source` 或 `file_token`，不通过 `downloadImage`
2. 去掉 `file://` 前缀，转换为纯文件系统路径
3. 区分两种URL用途：
   - `nativePath`: 用于导入PS，必须是纯路径
   - `displayUrl`: 用于在webview中显示，需要是 `file://` 或 `data:` URL

### 修复图片类型判断逻辑

在第47-48行：

```typescript
const currentItem = images[currentIndex];
// 从图层导入的图片默认认为是图片类型，即使URL可能没有扩展名
const isCurrentItemImage = currentItem ? (currentItem.source === 'layer-import' || isImage(currentItem.url)) : false;
```

**修改说明：**
- 如果图片的 `source` 字段为 `'layer-import'`，直接认为是图片类型
- 确保导入按钮正常显示

### 增强错误处理和调试日志

在 `sendToPSAtIndex` 函数中（第66-111行）：

```typescript
// 检查nativePath是否有效
if (!importParams.nativePath) {
  const errorMsg = '图像路径为空，无法导入';
  console.error('[导入到PS]', errorMsg);
  alert(errorMsg);
  return;
}

const result = await sdpppSDK.plugins.photoshop.importImage(importParams);

console.log('[导入到PS] 导入成功，返回结果:', result);
```

添加了完整的调试日志：
```typescript
console.log('[图层导入] getImage 返回数据:', { thumbnail_url, source, file_token });
console.log('[图层导入] 最终路径:', { rawPath, nativePath, isFilePath });
console.log('[图层导入] 显示URL:', displayUrl);
console.log('[导入到PS] 开始导入图像:', { index, source, imageData, importParams });
```

## 验证方法

### 完整测试流程

1. **从PS图层导入图片**
   - 点击"从图层导入"按钮
   - 确认图片成功添加到预览区域
   - 图片应该正常显示

2. **检查控制台日志**
   应该看到类似如下的日志：
   ```
   [图层导入] getImage 返回数据: { 
     thumbnail_url: "data:image/png;base64,...", 
     source: "file:///C:/Users/.../Temp/sdppp-xxx", 
     file_token: "file:///C:/Users/.../Temp/sdppp-xxx" 
   }
   [图层导入] 去掉file://前缀: { 
     rawPath: "file:///C:/Users/.../Temp/sdppp-xxx", 
     nativePath: "C:/Users/.../Temp/sdppp-xxx" 
   }
   [图层导入] 最终路径: { 
     rawPath: "file:///C:/Users/.../Temp/sdppp-xxx", 
     nativePath: "C:/Users/.../Temp/sdppp-xxx", 
     isFilePath: true 
   }
   ```

3. **检查按钮显示**
   - 鼠标悬停在预览图片上
   - 检查底部中间位置是否显示"导入到PS"按钮（蓝色，带同步图标）
   - 按钮应该是可点击状态

4. **测试导入功能**
   - 点击"导入到PS"按钮
   - 查看控制台日志：
     ```
     [导入到PS] 开始导入图像: { 
       index: 0, 
       source: "layer-import", 
       imageData: { 
         nativePath: "C:/Users/.../Temp/sdppp-xxx", 
         url: "data:image/...", 
         boundary: {...} 
       }, 
       importParams: { 
         nativePath: "C:/Users/.../Temp/sdppp-xxx", 
         boundary: {...}, 
         type: "smartobject" 
       } 
     }
     [导入到PS] 导入成功，返回结果: {...}
     ```
   - 确认图片成功导入回PS图层
   - 在PS中查看新创建的智能对象图层

5. **如果导入失败**
   - 检查控制台是否有错误日志
   - 查看 `[导入到PS] 导入失败` 相关信息
   - 会显示alert提示具体错误原因

## 流程对比

### 修复前的流程（有问题）

```
PS图层 → getImage → file:///C:/... → 直接作为nativePath → importImage ❌ 
                                   (路径格式错误，包含file://前缀)
```

### 修复后的流程

```
PS图层 → getImage → file:///C:/... → 去掉file://前缀 → C:/... → importImage ✅
                                                    (纯文件系统路径)
```

**关键区别：**
- 修复前：直接使用包含 `file://` 前缀的URL
- 修复后：正确转换为纯文件系统路径

## 相关文件

- `packages/sdppp-photoshop/src/tsx/components/ImagePreviewWrapper.tsx` - 主要修改文件
  - 第47-48行：图片类型判断逻辑
  - 第154-207行：核心修复，正确处理路径格式
  - 第66-111行：增强错误处理和调试日志
- `packages/sdppp-photoshop/src/utils/fileType.ts` - `isImage()` 函数定义
- `packages/ps-common/sdk/sdppp-ps-sdk.d.ts` - SDK接口定义
  - `getImage` 返回格式：`{ thumbnail_url?, source?, file_token? }`
  - `importImage` 参数格式：`{ nativePath: string, boundary, type, ... }`

## 注意事项

### 1. 路径格式是关键

- **getImage 返回**: `file:///C:/Users/...` (file:// URL)
- **importImage 需要**: `C:/Users/...` (纯路径)
- **必须转换**: 去掉 `file://` 或 `file:///` 前缀

### 2. 两种路径用途不同

- **nativePath**: 传给 `importImage`，必须是纯文件系统路径，不能包含 `file://`
- **displayUrl**: 用于在UXP webview中显示图片，需要是 `file://` URL或 `data:` URL

### 3. source 字段标识

- 从图层导入的图片: `source = 'layer-import'`
- 从ComfyUI导入的图片: `source = 工作流名称`
- 用于图片类型判断和来源追踪

### 4. 调试建议

**查看关键日志：**
- `[图层导入] getImage 返回数据` - 检查返回的路径格式
- `[图层导入] 去掉file://前缀` - 确认路径转换正确
- `[图层导入] 最终路径` - 验证 nativePath 格式
- `[导入到PS] 开始导入图像` - 检查传给 importImage 的参数
- `[导入到PS] 导入成功` - 确认导入成功

**检查要点：**
- `rawPath` 是否以 `file://` 开头
- `nativePath` 是否已去掉 `file://` 前缀
- `nativePath` 不应该包含 `file://`、`http://` 或 `data:` 前缀
- Windows路径格式：`C:/Users/...` 或 `C:\Users\...` 都可以

### 5. 常见问题

**Q: 导入时提示"图像路径为空"**
- A: 检查 `getImage` 是否正确返回了 `source` 或 `file_token`

**Q: 导入失败但没有明确错误**
- A: 可能是临时文件已被删除，尝试重新从图层导入

**Q: 按钮不显示**
- A: 检查 `isCurrentItemImage` 逻辑，确保 `source === 'layer-import'`

**Q: 文件路径包含 file:// 导致失败**
- A: 检查路径转换逻辑，确保 `nativePath` 已去掉前缀

### 6. 临时文件的生命周期

⚠️ **重要提示**：
- `getImage` 返回的文件路径通常指向临时文件
- 这些临时文件可能在一段时间后被系统清理
- 建议在从图层导入后尽快导入回PS，不要等待太久
- 如果临时文件已被删除，需要重新从图层导入

## 更新日期

2025-10-23

## 修复历史

- **v1**: 尝试使用 `downloadImage` "下载"本地文件 → 失败（network request failed）
- **v2**: 直接使用路径，但需要正确转换格式 → ✅ 成功
