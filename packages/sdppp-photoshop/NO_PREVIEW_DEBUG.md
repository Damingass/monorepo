# No Preview 问题调试 - width/height undefined

## 🔍 当前发现

### 问题症状
1. ✅ `getImage` 调用成功
2. ✅ 有 `source` 文件路径
3. ❌ `width` 和 `height` 都是 `undefined`
4. ❌ 导入后显示 "no preview"

### 根本原因

**`getImage` API 没有返回 `width` 和 `height` 字段！**

这可能是因为：
- SDK 版本问题
- getImage 的实现不包含尺寸信息
- 需要从其他地方获取尺寸

---

## 📋 新的测试流程

### 第5个弹窗（关键）

现在会显示完整的数据信息：

```
[5/8] 详细数据:
sourceUrl: C:/Users/xxx/AppData/Local/Temp/...
thumbnailUrl: data URL(12345字节)
width: undefined  ← ⚠️ 这里是undefined
height: undefined ← ⚠️ 这里是undefined
```

**请确认**:
- `sourceUrl` 是一个完整的文件路径
- `thumbnailUrl` 是一个 data URL

---

### 第6个弹窗（关键）

```
[6/8] 方案1:使用source
✅ nativePath长度: 156
✅ nativePath前40字符: C:/Users/xxx/AppData/Local/Temp/...
✅ displayUrl前40字符: file:///C:/Users/xxx/AppData/Loca...
✅ displayUrl格式正确: true
width/height: undefined/undefined (可能undefined)
```

**请确认**:
- `nativePath长度` 应该是一个合理的数字（比如 > 50）
- `nativePath前40字符` 显示的是正确的文件路径
- `displayUrl格式正确` 显示 `true`

---

### 第8个弹窗（最关键）

```
[8/8] ✅ 保存完成！

预览列表长度: 1

关键字段检查:
✅ url: file:///C:/Users/xxx/AppData/Loca...
✅ thumbnail_url: file:///C:/Users/xxx/AppData/Loca...
✅ nativePath: C:/Users/xxx/AppData/Local/Temp/...

尺寸: undefined × undefined

❗如果仍显示no preview:
1. 文件路径可能有问题
2. 文件可能不存在
3. UXP可能无法访问该路径

完整nativePath:
C:/Users/xxx/AppData/Local/Temp/xxx.png
```

**重点检查**:

1. **复制 `完整nativePath`**
2. **检查文件是否存在**:
   - 打开 Windows 资源管理器
   - 粘贴路径到地址栏
   - 看文件是否存在

3. **检查 URL 格式**:
   - `url` 和 `thumbnail_url` 都应该以 `file:///` 开头
   - 注意是 **3个斜杠**：`file:///`

---

## 🎯 可能的问题和解决方案

### 问题1：文件不存在

**症状**: nativePath 指向的文件不存在

**原因**: 
- `source` 是临时文件，可能已被删除
- 文件创建失败

**解决方案**:
- 需要使用 `downloadImage` 将图像保存到永久位置
- 但 `downloadImage` 可能会降采样...

---

### 问题2：UXP 无法访问文件路径

**症状**: 文件存在，但 UXP 无法加载

**原因**:
- UXP 可能对文件路径有访问限制
- `file:///` 协议可能不被支持

**解决方案**:
- 需要将图像转换为 data URL
- 或者使用 UXP 的文件 API

---

### 问题3：路径包含特殊字符

**症状**: 路径包含中文、空格或特殊字符

**原因**: URL 编码问题

**解决方案**:
```typescript
// 需要对路径进行 URL 编码
const encodedPath = normalizedPath.split('/').map(encodeURIComponent).join('/');
displayUrl = `file:///${encodedPath}`;
```

---

## 🔧 下一步修复方案

### 方案A：测试文件是否存在

在第8步后，添加文件存在性检查：

```typescript
// 尝试读取文件或检查文件是否存在
// （需要使用 UXP 文件 API）
```

### 方案B：使用 downloadImage 复制文件

```typescript
// 使用 source 构造 file:// URL
const sourceFileUrl = `file:///${sourceUrl.replace(/\\/g, '/')}`;

// 尝试用 downloadImage 复制到永久位置
const result = await downloadImage({ url: sourceFileUrl });

// 但这可能会降采样...
```

### 方案C：直接使用 data URL

```typescript
// 使用 thumbnail_url (data URL) 作为显示
// 虽然是低分辨率，但至少能显示

const newImage = {
  url: thumbnailUrl,  // data URL
  thumbnail_url: thumbnailUrl,  // data URL
  nativePath: sourceUrl,  // source 用于导出
  // ...
};
```

**权衡**:
- ✅ 预览能显示（虽然低分辨率）
- ✅ 导出到 PS 仍然是完整分辨率（使用 nativePath）
- ❌ 预览是 192×192

---

## 📝 需要反馈的信息

请在看到第8个弹窗后：

1. **复制完整的 nativePath**（弹窗底部）

2. **检查文件是否存在**:
   ```
   1. 打开 Windows 资源管理器
   2. 粘贴 nativePath 到地址栏
   3. 文件是否存在？
   ```

3. **检查预览状态**:
   ```
   - 显示 "no preview"？
   - 显示空白？
   - 显示加载中？
   - 显示错误图标？
   ```

4. **检查浏览器开发者工具**（如果有）:
   ```
   - 是否有图像加载失败的错误？
   - 错误消息是什么？
   ```

---

## 🎯 预期的成功标准

如果一切正常，应该：

1. ✅ 第5步显示有 `sourceUrl`（即使 width/height 是 undefined）
2. ✅ 第6步 `displayUrl格式正确: true`
3. ✅ 第8步保存成功
4. ✅ nativePath 指向的文件存在
5. ✅ 预览区域显示图像

如果失败：
- 优先解决文件访问问题
- 考虑使用方案C（data URL 显示 + source 导出）

