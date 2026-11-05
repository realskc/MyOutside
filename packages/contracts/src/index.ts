export * from "./common.js";
export * from "./vocab.js";
export * from "./platform.js";
export * from "./dialog.js";
export * from "./go.js";
export * from "./pureblue.js";

import type { VocabApi } from "./vocab.js";
import type { PlatformApi } from "./platform.js";
import type { DialogApi } from "./dialog.js";
import type { GoApi } from "./go.js";
import type { PureblueApi } from "./pureblue.js";

/** 全部已知 API 函数的合集（函数名 → 输入 / 输出） */
export interface ApiMap extends VocabApi, PlatformApi, DialogApi, GoApi, PureblueApi {}
