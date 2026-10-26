# VOCAB-0007 查词：AI 翻译解说并生成卡片草稿；结果不缓存；音标由 AI 产出（美式 IPA）

- 状态：有效
- 日期：2026-10-02
- 决策者：讨论
- 服务于：
  - 作者预期：[学英语 user spec「定位」](../README.md)
  - 上游决策：[VOCAB-0004](VOCAB-0004-card-content-in-chinese.md)

## 决策

- 输入单词 → 界面调用平台 AI 做翻译与解说；请求中带一个「生成卡片」工具（`make_card`），AI 返回结构化的卡片草稿（单词 / 意项 / 音标 / 释义 / 例句）；
- 用户确认后走添加流程（VOCAB-0002）；
- 查词结果不缓存，每次实时调用；
- 音标目前只由 AI 产出，可以手工修正；统一按 [VOCAB-0010](VOCAB-0010-general-american-phonetic.md) 的 General American 标准。

## 理由

作者对这些细节不敏感。

## 什么时候应该重新考虑

随时可以。

## 相关文档

- `apps/vocab/docs/README.md` §5；`apps/vocab/ui/ui.js`

## 修订记录

- 2026-10-26：作者要求音标统一为美式 IPA；见 [VOCAB-0010](VOCAB-0010-general-american-phonetic.md)。
