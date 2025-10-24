# Base64格式处理修复说明

## 🔍 问题根源

参考用户提供的Java代码，发现问题在于**base64字符串的前缀处理**。

### 关键发现

`getImageBase64` 返回的 base64 数据需要正确处理前缀：

1. **可能已经包含前缀**：`data:image/png;base64,xxxxx`
2. **可能是纯净base64**：`iVBORw0KGgo...`
3. **空格替换问题**：Ajax传输时会把 `+` 替换成空格

### Java代码参考

```java
// 前台在用Ajax传base64值的时候会把base64中的+换成空格，所以需要替换回来
String baseValue = img.replaceAll(" ", "+");

// 去除base64中无用的部分（关键！）
byte[] b = decoder.decodeBuffer(baseValue.replace("data:image/png;base64,", ""));
```

**要点**：必须去除 `data:image/png;base64,` 前缀，否则转换会失败！

## ✅ 修复方案

### 修复后的代码

```typescript
const base64Result = await sdpppSDK.plugins.photoshop.getImageBase64({ 
  token: file_token 
});

if (base64Result.base64) {
  let base64String = base64Result.base64;
  const mimeType = base64Result.mimeType || 'image/png';
  
  // 情况1：已经是完整的 data URL
  if (base64String.startsWith('data:')) {
    fullResolutionDataUrl = base64String;
  } 
  // 情况2：需要清理并重新构造
  else {
    // 步骤1：去除任何可能存在的前缀
    base64String = base64String
      .replace(/^data:image\/\w+;base64,/, '')  // 去除 data:image/*;base64,
      .replace(/\s/g, '+');  // 空格替换回 +
    
    // 步骤2：构造正确的 data URL
    fullResolutionDataUrl = `data:${mimeType};base64,${base64String}`;
  }
}
```

### 处理逻辑

```
获取 base64Result.base64
  ↓
检查是否已包含 "data:" 前缀？
  ├─ 是 → 直接使用（已经是完整 data URL）
  └─ 否 → 
      ↓
      1. 去除可能的 data:image/*;base64, 前缀
      2. 将空格替换回 +
      3. 添加正确的前缀：data:${mimeType};base64,
```

## 🔑 关键改进点

### 1. 前缀检测和清理
```typescript
// 使用正则去除任何格式的前缀
.replace(/^data:image\/\w+;base64,/, '')
```
- 匹配 `data:image/png;base64,`
- 匹配 `data:image/jpeg;base64,`
- 匹配 `data:image/jpg;base64,`
- 等等...

### 2. 空格处理
```typescript
.replace(/\s/g, '+')
```
解决Ajax传输时 `+` 被转换为空格的问题

### 3. 智能判断
```typescript
if (base64String.startsWith('data:')) {
  // 已经是完整格式，不需要处理
}
```

## 📊 对比

### 修复前（❌ 文件损坏）
```typescript
// 直接拼接，可能导致重复前缀或格式错误
fullResolutionDataUrl = `data:${mimeType};base64,${base64Result.base64}`;

// 如果 base64Result.base64 = "data:image/png;base64,iVBORw..."
// 结果: "data:image/png;base64,data:image/png;base64,iVBORw..." ❌
```

### 修复后（✅ 正确格式）
```typescript
// 先清理，再构造
base64String = base64String
  .replace(/^data:image\/\w+;base64,/, '')
  .replace(/\s/g, '+');
fullResolutionDataUrl = `data:${mimeType};base64,${base64String}`;

// 如果 base64Result.base64 = "data:image/png;base64,iVBORw..."
// 清理后: "iVBORw..."
// 结果: "data:image/png;base64,iVBORw..." ✅
```

## 🎯 测试验证

运行后查看控制台日志：

```javascript
// 情况1：已包含前缀
[handleImportFromLayer] base64已包含data URL前缀，直接使用 {
  prefix: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  base64Length: 123456
}

// 情况2：清理并添加前缀
[handleImportFromLayer] 清理base64并添加前缀 {
  mimeType: "image/png",
  originalLength: 123456,
  cleanedLength: 123400,  // 减少了前缀的长度
  preview: "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACN..."
}
```

## 📝 修改文件

**文件**: `packages/sdppp-photoshop/src/tsx/components/ImagePreviewWrapper.tsx`

**函数**: `handleImportFromLayer`

**行数**: 187-221

## 🎉 预期结果

- ✅ 文件可以正常打开（不再显示"不支持的格式"）
- ✅ base64 格式正确处理
- ✅ 支持多种图片格式（png、jpeg、jpg等）
- ✅ 处理Ajax传输的空格问题
- ✅ 完整分辨率正确保存

## 🙏 致谢

感谢用户提供的Java代码示例，揭示了base64前缀处理的关键问题！

