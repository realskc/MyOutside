# builder

## 是什么

- builder 是 **MyOutside 内置的 vibe coding 工具**：一个在内核框架下干活的 agent。
- **主要职责就是 vibe coding**：建立子应用、修改子应用；附带一次性需求之类的功能。
- 这是「每个人的应用都不一样」成为产品能力的实现路径（见 `product.md`「产品命题」）。
- 用 builder 编写应用要有很好的使用体验：不用关心技术细节，又能又快又好地实现想法（见 `product.md`「技术层面的预期」）。

## 服从作者定义的 vibe coding 层级

作者定义的 vibe coding 有两个层级：**user spec 层**（用户的预期）与**技术实现层**（见 `principles.md`「新的 vibe coding：user spec」）。builder 做 vibe coding 时要**服从这个层级设计**——和本项目自身的开发方式一样（见 `README.md`）。

## 边界

- 一次性需求：builder 可以临时在应用现有接口之外直接完成，但要用户知情、事后可追溯（形态见 [D-0001](../decisions/0001-one-off-functions.md)）。
- **永久性的修改必须经用户同意**（见 `principles.md`「需求观」）。
- builder 的行为边界既要有软约束，也要有内核框架与 agent 框架层面的硬约束（见 `principles.md`「约束：软约束与硬约束都要」）。

## 未定

- 实现时机：v1 之后。
- **builder 的权限**整体留到设计 builder 时再讨论。现阶段的设计只考虑两个主体的权限层级：**开发者**（作者与 agent）与**子应用**（运行时）。待讨论的例子：
  - builder 修改子应用清单（manifest，尤其是权限声明 `uses`）是否必须找用户批准（见 [D-0056](../decisions/0056-app-manifest.md)）；
  - builder 写的迁移能否使用 `exec` 逃生口（原样执行 SQL、不受表前缀限制，见 [D-0005](../decisions/0005-data-ownership-by-table-prefix.md)）。
