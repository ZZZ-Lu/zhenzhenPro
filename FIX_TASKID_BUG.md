# [object Object] 导致生图等待 5 分钟超时的 Bug 修复

致 开发者 / Agent：

在您提供的代码中，导致生图任务卡住轮询 5 分钟并最终超时的核心原因是 **`taskId` 被错误地赋值为了一个对象**。

## Bug 根源分析
代码中有 3 处类似下面这样的赋值：
```typescript
const taskId = data.task_id || data.data;
```
由于某些后端接口返回的 `data.data` 可能是一个对象（例如 `{"data": {"task_id": "xxxxx", "status": "IN_QUEUE"}}`），这导致 `taskId` 变成了一个 Object。

接着在拼接查询 URL 时：
```typescript
const statusRes = await fetch(`/api/t8star/v1/images/tasks/${taskId}` ...
```
对象被强制转换为字符串，URL 就变成了 `/api/t8star/v1/images/tasks/[object Object]`。
这个错误的 URL 会导致查询不到真实的生成状态，代码就会陷入 `while` 循环不断轮询（每次等待 5 秒），直到达到 60 次上限（整整 5 分钟），最后抛出 Timeout 错误。

## 修复方法

请在代码中找到所有的 `const taskId = data.task_id || data.data;`（一共 3 处，分别在 `nano-banana`、`2in1` 和常规模型的处理逻辑中）。

**将其替换为更严谨的取值方式：**
```typescript
const taskId = data.task_id || data.data?.task_id || (typeof data.data === 'string' ? data.data : null);
```

这样修改后，如果 `data.data` 是一个对象，就会正确提取里面的 `.task_id`；如果是字符串，则直接使用，彻底杜绝 `[object Object]` 的 Bug。

> **注：** 因为您发来的代码有 1600 多行，体积过大超出了 AI 单次自动写入文件的字数上限，直接输出会触发截断错误。请您将上述修复方案发给那个项目的 Agent，或者直接复制这个替换代码去修改那 3 处地方，生图慢的问题即可立刻解决！
