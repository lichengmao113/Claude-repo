import type { Domain, EdgeKind, NodeKind, TemporalLayer } from "./belief-types";

/**
 * Display names and colours shared by the 3D universe, its legend, the outline
 * and the inspector. Change a label or a colour here and every view follows.
 */

export const KIND_STYLE: Record<NodeKind, { label: string; color: string }> = {
  value: { label: "价值方向", color: "#e9c46a" },
  "resource-core": { label: "资源性核心", color: "#7fdcc4" },
  "limiting-core": { label: "限制性核心", color: "#ef8b85" },
  rule: { label: "条件规则", color: "#74b7ea" },
  strategy: { label: "保护策略", color: "#a596f5" },
  "bridge-belief": { label: "桥梁信念", color: "#6fe0d8" },
  trigger: { label: "触发", color: "#f2a874" },
  "emotion-body": { label: "情绪 / 身体", color: "#e59ab8" },
  behavior: { label: "行为", color: "#9fb4c9" },
  outcome: { label: "结果", color: "#8fa8c8" },
  evidence: { label: "证据", color: "#a9b6c3" },
  "source-event": { label: "来源 / 事件", color: "#c9a77c" },
  "experiment-practice": { label: "小验证", color: "#9ad37f" },
};

export const KIND_ORDER = Object.keys(KIND_STYLE) as NodeKind[];

/** Ring a new node of this kind starts on (0 = centre). */
export const KIND_DEFAULT_DEPTH: Record<NodeKind, number> = {
  value: 0,
  "resource-core": 1,
  "limiting-core": 1,
  rule: 2,
  "bridge-belief": 2,
  strategy: 3,
  "emotion-body": 3,
  "experiment-practice": 3,
  trigger: 4,
  behavior: 4,
  outcome: 4,
  evidence: 4,
  "source-event": 4,
};

export const DOMAIN_STYLE: Record<Domain, { label: string; color: string }> = {
  self: { label: "自我", color: "#82d8c5" },
  relationship: { label: "关系", color: "#f0a576" },
  life: { label: "生命与意义", color: "#9a8cf1" },
  career: { label: "工作", color: "#6ab2df" },
  money: { label: "金钱", color: "#e2bf6a" },
  body: { label: "身体", color: "#df807a" },
  learning: { label: "学习与创造", color: "#7bc49e" },
  uncertainty: { label: "不确定性", color: "#a58aca" },
  creation: { label: "创造", color: "#72c7b0" },
  meaning: { label: "意义", color: "#9a8cf1" },
};

export const EDGE_STYLE: Record<EdgeKind, { label: string; color: string; dashed?: boolean }> = {
  "originated-from": { label: "源自", color: "#b4a3e8" },
  activates: { label: "触发", color: "#f2a874" },
  "leads-to": { label: "导致", color: "#9fb4c9" },
  supports: { label: "支持", color: "#7fdcc4" },
  "conflicts-with": { label: "与…冲突", color: "#ef8b85", dashed: true },
  shapes: { label: "塑造", color: "#a596f5" },
  protects: { label: "保护需要", color: "#8fcfb8" },
  drives: { label: "驱动", color: "#f2c46d" },
  reinforces: { label: "强化", color: "#a8d89a" },
  challenges: { label: "质疑", color: "#f2a874", dashed: true },
  reframes: { label: "重构", color: "#6fe0d8" },
  tests: { label: "验证", color: "#74b7ea" },
};

export const EDGE_ORDER = Object.keys(EDGE_STYLE) as EdgeKind[];

/** Names of the five rings, from the centre outwards. */
export const DEPTH_LABELS = ["价值", "核心", "规则", "策略 · 感受", "表现 · 情境"] as const;

export const TIME_LABELS: Record<TemporalLayer, string> = {
  past: "过去",
  current: "当下",
  emerging: "形成中",
};
