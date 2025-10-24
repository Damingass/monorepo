# "No Preview" 问题调试指南

## 🔍 问题症状

PS 图层导入后显示 "no preview"

---

## 📋 调试日志检查清单

请按照以下顺序查看控制台日志，逐步定位问题：

### 第1步：检查 getImage 返回数据

```
[图层导入] === getImage 返回完整数据分析 ===
[图层导入] thumbnail_url类型: ?
[图层导入] source路径: ?
[图层导入] width×height: ? × ?
```

**预期**:
- `source路径` 应该是一个有效的文件路径，如 `C:/Users/.../Temp/xxx.png`
- `width×height` 应该是图层的实际尺寸，如 `1024 × 1024`

**如果异常**:
- ❌ `source路径: undefined` → getImage 没有返回 source
- ❌ `width×height: undefined × undefined` → getImage 没有返回尺寸

---

### 第2步：检查方案选择

```
[图层导入] === 决策：使用哪个数据源？ ===
[图层导入] sourceUrl是否存在: ?
[图层导入] thumbnailUrl是否存在: ?
[图层导入] sourceUrl值: ?
```

**预期**:
- `sourceUrl是否存在: true`
- `sourceUrl值:` 应该是完整的文件路径

**如果异常**:
- ❌ `sourceUrl是否存在: false` → 没有 source，会使用方案2（低分辨率）

---

### 第3步：检查执行的方案

```
[图层导入] === 方案选择 ===
[图层导入] 将要执行的方案: ?
```

**预期**:
- `方案1（source）`

**如果异常**:
- ❌ `方案2（thumbnailUrl）` → 使用了低分辨率 data URL
- ❌ `错误：都不存在` → 既没有 source 也没有 thumbnail_url

---

### 第4步：检查方案1的执行（如果使用方案1）

```
[图层导入] ✅ 方案1：直接使用 source 文件（完整分辨率）
[图层导入] source路径: ?
[图层导入] 清理后的nativePath: ?
[图层导入] 生成displayUrl（用于预览，指向同一文件）: ?
```

**预期**:
- `source路径:` 完整文件路径
- `清理后的nativePath:` 去除 `file://` 前缀的纯路径
- `生成displayUrl:` `file:///C:/Users/.../xxx.png` 格式

**如果异常**:
- ❌ `displayUrl` 格式不正确
- ❌ 路径包含特殊字符或空格没有正确转义

---

### 第5步：检查保存到 store 前的数据

```
[图层导入] === 保存到store前的数据检查 ===
[图层导入] url: ?
[图层导入] url类型: ?
[图层导入] url是否以file://开头: ?
[图层导入] thumbnail_url: ?
[图层导入] thumbnail_url类型: ?
[图层导入] thumbnail_url === url: ?
[图层导入] nativePath: ?
[图层导入] width × height: ?
```

**预期**:
- `url:` `file:///C:/Users/.../xxx.png`
- `url类型: string`
- `url是否以file://开头: true`
- `thumbnail_url:` 应该和 `url` 相同
- `thumbnail_url === url: true`
- `nativePath:` `C:/Users/.../xxx.png`（纯路径，无 file://）
- `width × height: 1024 × 1024`（完整分辨率）

**如果异常**:
- ❌ `url: undefined` → displayUrl 没有被设置
- ❌ `url类型: undefined` → url 是 undefined
- ❌ `thumbnail_url: undefined` → thumbnail_url 没有被设置
- ❌ `width × height: 0 × 0` → 尺寸丢失

---

### 第6步：检查 store 中的数据

```
[图层导入] === 验证store中的数据 ===
[图层导入] store中的url: ?
[图层导入] store中的thumbnail_url: ?
[图层导入] store中的nativePath: ?
```

**预期**:
- 应该和第5步保存的数据一致

**如果异常**:
- ❌ 数据和第5步不一致 → store 设置有问题
- ❌ 某些字段变成了 undefined → 数据在保存过程中丢失

---

### 第7步：检查 useMemo 处理

```
[ImagePreviewWrapper] useMemo处理最新PS图层导入: {
  原始url: ?
  原始thumbnail_url: ?
  原始nativePath: ?
  处理后thumbnail_url: ?
  是否有thumbnail_url: ?
  是否有url: ?
}
```

**预期**:
- `原始url:` `file:///C:/Users/.../xxx.png...`
- `原始thumbnail_url:` `file:///C:/Users/.../xxx.png...`
- `处理后thumbnail_url:` `file:///C:/Users/.../xxx.png...`
- `是否有thumbnail_url: true`
- `是否有url: true`

**如果异常**:
- ❌ `是否有thumbnail_url: false` → thumbnail_url 丢失
- ❌ `处理后thumbnail_url` 不是 file:// 格式 → 回退逻辑有问题

---

### 第8步：检查 ImagePreview 组件

```
[ImagePreview] 当前图像数据: {
  index: ?
  url: ?
  thumbnail_url: ?
  nativePath: ?
  source: ?
  是否有thumbnail_url: ?
  是否有url: ?
  downloading: ?
}
```

**预期**:
- `url:` `file:///C:/Users/.../xxx.png...`
- `thumbnail_url:` `file:///C:/Users/.../xxx.png...`
- `是否有thumbnail_url: true`
- `是否有url: true`
- `downloading: false`

**如果异常**:
- ❌ `是否有thumbnail_url: false` → ImagePreview 会显示空 div（"no preview"）
- ❌ `thumbnail_url: undefined` → 这是根本原因

---

## 🎯 常见问题和解决方案

### 问题1：sourceUrl 为 undefined

**原因**: getImage 没有返回 source 或 file_token

**解决方案**:
1. 检查 PS 版本和 SDK 版本是否兼容
2. 确认图层是可见且非空的
3. 尝试使用方案2（虽然会降分辨率）

### 问题2：displayUrl 格式错误

**原因**: 路径清理或格式化逻辑有误

**检查**:
```typescript
// 应该是：file:///C:/Users/xxx/xxx.png
// 不应该是：file://C:/Users/xxx/xxx.png （少一个斜杠）
// 不应该是：C:/Users/xxx/xxx.png （没有协议）
```

### 问题3：thumbnail_url 在传递过程中丢失

**原因**: 
- 可能是空字符串（''）而不是 undefined
- 空字符串在布尔检查时是假值

**解决方案**:
- 检查是否有地方将 undefined 转换成了空字符串
- 在 useMemo 中使用更强的检查：`!img.thumbnail_url` 而不是 `img.thumbnail_url || img.url`

### 问题4：文件路径包含特殊字符

**原因**: 文件路径包含空格、中文或特殊字符，没有正确编码

**解决方案**:
```typescript
// 生成 displayUrl 时进行 URL 编码
const normalizedPath = nativePath.replace(/\\/g, '/');
const encodedPath = normalizedPath.split('/').map(encodeURIComponent).join('/');
displayUrl = `file:///${encodedPath}`;
```

---

## 🔧 紧急修复方案

如果问题持续存在，可以尝试以下紧急修复：

### 修复1：强制使用 data URL

```typescript
// 在方案1中，同时保存 data URL 作为回退
const newImage = {
  url: displayUrl,                    // file:// URL
  thumbnail_url: thumbnailUrl,        // data URL（低分辨率但确保能显示）
  nativePath: nativePath,             // 纯路径（用于导入PS）
  // ...
};
```

**权衡**:
- ✅ 预览能够显示（虽然是低分辨率）
- ❌ 预览是 192×192 缩略图
- ✅ 导入到 PS 仍然是完整分辨率（因为使用 nativePath）

### 修复2：使用 downloadImage 复制文件

```typescript
// 使用 downloadImage 将 source 复制到永久位置
const fileUrl = `file:///${sourceUrl.replace(/\\/g, '/')}`;
try {
  const result = await downloadImage({ url: fileUrl });
  if (!('error' in result) && result.nativePath) {
    // 使用 downloadImage 返回的永久路径
    nativePath = result.nativePath;
    displayUrl = `file:///${nativePath.replace(/\\/g, '/')}`;
  }
} catch (e) {
  // 回退到直接使用 source
}
```

**权衡**:
- ✅ 获得永久文件
- ❌ 可能会降采样（需要测试）
- ❌ 多一次文件复制操作

---

## 📞 需要反馈的信息

如果问题仍然无法解决，请提供以下日志信息：

1. **完整的控制台日志**（从 `[图层导入] 开始导入流程` 到 `[ImagePreview] 当前图像数据`）
2. **PS 版本**
3. **图层类型**（普通图层、智能对象等）
4. **图层尺寸**
5. **是否有报错信息**

---

## 🎉 成功的标志

如果一切正常，应该看到：

```
[图层导入] ✅ 方案1完成，跳过downloadImage
[图层导入] ✅ 分辨率保持一致: 1024×1024像素
[ImagePreviewWrapper] useMemo处理最新PS图层导入: {
  是否有thumbnail_url: true
}
[ImagePreview] 当前图像数据: {
  是否有thumbnail_url: true
}
```

并且：
- ✅ 预览区域显示图像（不是 "no preview"）
- ✅ 图像清晰，和 PS 图层一致
- ✅ 可以重复导入到 PS，保持完整分辨率

