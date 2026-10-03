"use client";

import { useMemo, useState, type CSSProperties } from "react";

import type { BeliefEdge, BeliefNode, EdgeKind } from "../../lib/belief-types";
import { EDGE_ORDER, EDGE_STYLE, KIND_ORDER, KIND_STYLE } from "../../lib/belief-theme";
import type { LabelMode } from "../BeliefScene";

export function SceneHeading({ mode }: { mode: "3d" | "2d" }) {
  return (
    <div className="scene-heading">
      <div className="section-kicker">核心层级网络 · 可修改导航隐喻</div>
      <h1>你的信念宇宙</h1>
      {mode === "3d" ? (
        <ul className="encoding-chips" aria-label="空间含义">
          <li><b>半径</b>抽象深度</li>
          <li><b>方位</b>生活领域</li>
          <li><b>高度</b>过去 · 当下 · 形成中</li>
        </ul>
      ) : null}
    </div>
  );
}

interface SceneToolsProps {
  mode: "3d" | "2d";
  focusMode: "all" | "neighbors";
  labelMode: LabelMode;
  showBridges: boolean;
  /** 3D only. */
  onReset?: () => void;
  onToggleFocus?: () => void;
  onToggleLabels?: () => void;
  onToggleBridges: () => void;
  onOpenChapters: () => void;
}

export function SceneTools({
  mode,
  focusMode,
  labelMode,
  showBridges,
  onReset,
  onToggleFocus,
  onToggleLabels,
  onToggleBridges,
  onOpenChapters,
}: SceneToolsProps) {
  return (
    <div className="scene-tools" role="toolbar" aria-label="视图工具">
      {mode === "3d" ? (
        <>
          <button type="button" className="scene-tool" onClick={onReset} title="回到全景视角">
            <i aria-hidden="true">⟲</i><span>全景</span>
          </button>
          <button type="button" className={`scene-tool${focusMode === "neighbors" ? " active" : ""}`} aria-pressed={focusMode === "neighbors"} onClick={onToggleFocus} title="只显示选中节点和它的相邻节点">
            <i aria-hidden="true">◎</i><span>只看相邻</span>
          </button>
          <button type="button" className={`scene-tool${labelMode === "all" ? " active" : ""}`} aria-pressed={labelMode === "all"} onClick={onToggleLabels} title="显示全部标签，或只显示核心与相邻节点的标签">
            <i aria-hidden="true">Aa</i><span>{labelMode === "all" ? "全部标签" : "核心标签"}</span>
          </button>
        </>
      ) : null}
      <button type="button" className={`scene-tool${showBridges ? " active" : ""}`} aria-pressed={showBridges} onClick={onToggleBridges} title="显示或隐藏桥梁信念">
        <i aria-hidden="true">≋</i><span>桥梁</span>
      </button>
      <button type="button" className="scene-tool" onClick={onOpenChapters} title="赛斯章节索引">
        <i aria-hidden="true">§</i><span>章节</span>
      </button>
    </div>
  );
}

/**
 * Legend built from what is on screen, so it never lists colours you cannot see.
 * It folds away while the quick editor is open, unless you open it yourself.
 */
export function SceneLegend({ nodes, edges, editing }: { nodes: BeliefNode[]; edges: BeliefEdge[]; editing: boolean }) {
  // Phones start folded; the legend would otherwise cover half the universe.
  const [choice, setChoice] = useState<boolean | undefined>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 940px)").matches ? false : undefined,
  );
  const open = choice ?? !editing;
  const kinds = useMemo(() => KIND_ORDER.filter((kind) => nodes.some((node) => node.kind === kind)), [nodes]);
  const edgeKinds = useMemo(() => EDGE_ORDER.filter((kind) => edges.some((edge) => edge.kind === kind)), [edges]);

  return (
    <div className={`scene-legend${open ? " open" : ""}`}>
      <button type="button" className="legend-toggle" aria-expanded={open} onClick={() => setChoice(!open)}>
        图例 <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <>
          <div className="legend-group" aria-label="节点类型">
            {kinds.map((kind) => (
              <span key={kind}><i className="legend-dot" style={{ "--legend-color": KIND_STYLE[kind].color } as CSSProperties} />{KIND_STYLE[kind].label}</span>
            ))}
          </div>
          <div className="legend-group" aria-label="关系类型">
            {edgeKinds.map((kind) => (
              <span key={kind}><i className={`legend-line${EDGE_STYLE[kind].dashed ? " dashed" : ""}`} style={{ "--legend-color": EDGE_STYLE[kind].color } as CSSProperties} />{EDGE_STYLE[kind].label}</span>
            ))}
          </div>
          <div className="legend-group legend-encoding">
            <span><i className="legend-dot glow" />光晕越亮，置信越高</span>
            <span><i className="legend-dot ring" />虚线环：推断或待验证</span>
          </div>
          <p className="legend-note">位置不是客观心理测量。节点可修改、可归档，推断和桥梁信念保留 I / G 标记。</p>
        </>
      ) : null}
    </div>
  );
}

export function SceneHint() {
  return (
    <div className="scene-hint" role="note">
      <strong>点击星体</strong>即可就地修改 · 拖动旋转 · 滚轮缩放 · 右键拖动平移
    </div>
  );
}

interface LinkBannerProps {
  sourceLabel: string;
  kind: EdgeKind;
  onKindChange: (kind: EdgeKind) => void;
  onCancel: () => void;
}

export function LinkBanner({ sourceLabel, kind, onKindChange, onCancel }: LinkBannerProps) {
  return (
    <div className="link-banner" role="status">
      <span className="link-banner-icon" aria-hidden="true">⤳</span>
      <span>
        从「{sourceLabel}」出发，点击另一个星体建立
        <select aria-label="关系类型" value={kind} onChange={(event) => onKindChange(event.target.value as EdgeKind)}>
          {EDGE_ORDER.map((item) => <option key={item} value={item}>{EDGE_STYLE[item].label}</option>)}
        </select>
        关系
      </span>
      <button type="button" className="soft-button" onClick={onCancel}>取消 <kbd>Esc</kbd></button>
    </div>
  );
}
