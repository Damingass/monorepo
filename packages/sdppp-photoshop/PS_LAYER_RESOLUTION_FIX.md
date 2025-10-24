# PS图层导入分辨率修复总结

## 📋 问题
从PS图层导入到预览画面后，再导入回PS图层时，**分辨率大幅下降**（从完整分辨率降到192×192）

## ✅ 解决方案
参考ComfyUI的实现方式，使用 **file_token + getImageBase64 + downloadImage** 流程获取并保存完整分辨率图片。

## 🔧 修改内容

### 修改文件
`packages/sdppp-photoshop/src/tsx/components/ImagePreviewWrapper.tsx`

### 修改函数
`handleImportFromLayer` (第134-285行)

### 核心改动

#### 修改前（❌ 低分辨率）
```typescript
const thumbnailUrl = imageResult.thumbnail_url;  // 192×192 缩略图
const downloadResult = await sdpppSDK.plugins.photoshop.downloadImage({ 
  url: thumbnailUrl  // ← 保存低分辨率
});
```

#### 修改后（✅ 完整分辨率）
```typescript
// 第1步：获取 file_token（完整分辨率令牌）
const file_token = imageResult.file_token;

// 第2步：使用 file_token 获取完整分辨率 base64
const base64Result = await sdpppSDK.plugins.photoshop.getImageBase64({ 
  token: file_token 
});

// 第3步：构造完整分辨率 data URL
const fullResolutionDataUrl = `data:${base64Result.mimeType};base64,${base64Result.base64}`;

// 第4步：保存完整分辨率到本地
const downloadResult = await sdpppSDK.plugins.photoshop.downloadImage({ 
  url: fullResolutionDataUrl  // ← 保存完整分辨率 ✅
});
```

## 🎯 技术要点

1. **对齐ComfyUI流程**  
   ComfyUI使用HTTP URL获取完整分辨率，我们使用file_token获取完整分辨率

2. **参考工作流实现**  
   工作流中使用file_token上传到ComfyUI，我们使用file_token保存到本地

3. **容错机制**  
   如果file_token无效或getImageBase64失败，回退到thumbnail_url

4. **详细日志**  
   添加了完整的console.log便于调试和验证

## 📊 流程对比

| 步骤 | ComfyUI | PS图层（修复前） | PS图层（修复后） |
|------|---------|----------------|----------------|
| 数据来源 | HTTP URL | thumbnail_url | file_token → getImageBase64 |
| 分辨率 | 完整（1024×1024） | 低（192×192）❌ | 完整（1024×1024）✅ |
| downloadImage输入 | 完整分辨率URL | 低分辨率URL | 完整分辨率data URL |
| nativePath指向 | 完整分辨率文件 | 低分辨率文件❌ | 完整分辨率文件✅ |
| 导入到PS | ✅ 完整分辨率 | ❌ 低分辨率 | ✅ 完整分辨率 |

## 🔑 使用的SDK API

1. **getImage** - 获取图层数据和file_token
   ```typescript
   sdpppSDK.plugins.photoshop.getImage({
     boundary, content, imageSize, imageQuality, cropBySelection, SkipNonNormalLayer
   })
   ```

2. **getImageBase64** - 使用file_token获取完整分辨率base64
   ```typescript
   sdpppSDK.plugins.photoshop.getImageBase64({ token: file_token })
   ```

3. **downloadImage** - 保存到本地永久文件
   ```typescript
   sdpppSDK.plugins.photoshop.downloadImage({ url: fullResolutionDataUrl })
   ```

## 🧪 验证方法

1. 在Photoshop中创建一个1024×1024的图层
2. 点击预览界面的"+"按钮从图层导入
3. 检查控制台日志，应该看到：
   ```
   [handleImportFromLayer] 成功获取完整分辨率 base64
   [handleImportFromLayer] ✅ 成功导入图层（完整分辨率）
   resolution: "1024×1024"
   ```
4. 点击导入按钮将预览导入回PS
5. 检查PS中的图层分辨率，应该保持1024×1024

## 📚 相关文档

- [LAYER_IMPORT_BUTTON_FIX_FINAL.md](./LAYER_IMPORT_BUTTON_FIX_FINAL.md) - 详细技术文档
- [COMFYUI_VS_PS_LAYER_IMPORT.md](./COMFYUI_VS_PS_LAYER_IMPORT.md) - 流程对比分析

## 🎉 修复状态

✅ **已完成** - 2024-10-24

现在PS图层导入的分辨率与ComfyUI生成的图片完全一致，都保持完整分辨率！

