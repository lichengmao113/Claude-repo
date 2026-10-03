"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BeliefEdge, BeliefNode } from "../lib/belief-types";

type ArchitectureProps = {
  nodes: BeliefNode[];
  edges: BeliefEdge[];
  selectedId?: string;
  onSelect: (id: string) => void;
};

type LayerId = "values" | "core" | "rules" | "attention" | "feeling" | "responses" | "possibilities" | "context" | "branches";

const LAYERS: { id: LayerId; label: string; color: string }[] = [
  { id: "values", label: "价值与资源", color: "#82d8c5" },
  { id: "core", label: "核心候选", color: "#df807a" },
  { id: "rules", label: "条件规则", color: "#e2bf6a" },
  { id: "attention", label: "意识心焦点", color: "#6ab2df" },
  { id: "feeling", label: "感受线索", color: "#df9fa7" },
  { id: "responses", label: "应对与反馈", color: "#a9b6c3" },
  { id: "possibilities", label: "待验证立场", color: "#82d8c5" },
  { id: "context", label: "相关背景与证据", color: "#a9b6c3" },
  { id: "branches", label: "未确定与待补证分支", color: "#acaa98" },
];

const DOMAINS: Record<BeliefNode["primaryDomain"], string> = {
  self: "自我", relationship: "关系", life: "生活", career: "工作", money: "财富",
  body: "身体", learning: "学习", uncertainty: "不确定性", creation: "创造", meaning: "意义",
};

const OVERVIEW_LAYERS: {
  id: LayerId;
  label: string;
  qualifier: string;
  items: [string, string][];
}[] = [
  { id: "values", label: "价值与资源", qualifier: "归纳", items: [
    ["value-autonomy", "自主选择"], ["value-capability", "理解与能力"],
    ["value-aliveness", "投入与生命感"], ["core-resource-author", "主动参与和判断"],
  ] },
  { id: "core", label: "核心候选", qualifier: "待核对", items: [
    ["core-limiting-conditional-worth", "成果联系自我认可"], ["core-limiting-completeness", "充分准备才安心"],
    ["core-limiting-thought-responsibility", "心理活动可能伤害我"], ["rev-core-self-trust", "对调整与创造的信任有条件"],
  ] },
  { id: "rules", label: "条件规则", qualifier: "原话与归纳", items: [
    ["rule-understand-before-act", "状态对、第一遍做好"], ["rev-rule-utility", "重要、实际、主线优先"],
    ["rev-rule-energy", "投入太多会后劲不足"], ["rule-leap-compress-time", "尽快见效、少走漫长过程"],
  ] },
  { id: "attention", label: "意识心焦点", qualifier: "归纳", items: [
    ["rev-focus-adequacy", "我够好吗、状态对吗"], ["rev-focus-cost", "值不值、多久见效"],
    ["rev-focus-threat", "哪里会消耗或干扰我"], ["rev-focus-participation", "内容、探索与即时反馈"],
  ] },
  { id: "feeling", label: "感受线索", qualifier: "情境中的表现", items: [
    ["rev-feeling-urgency", "急迫与重负"], ["rev-feeling-wariness", "戒备与担心"],
    ["rev-feeling-absorption", "沉浸、活跃与乐趣"], ["rev-feeling-relief", "放松、安定与享受"],
  ] },
  { id: "responses", label: "应对与反馈", qualifier: "原话与归纳", items: [
    ["rev-behavior-checking", "反复检查内部状态"], ["rev-behavior-hesitation", "重要任务前犹豫"],
    ["rev-behavior-revise", "主动核对、组织与参与"],
  ] },
  { id: "context", label: "外部情境", qualifier: "独立参与", items: [
    ["rev-context-loss", "现实损失与生活变化"], ["rev-context-participation", "参与方式与熟悉环境"],
  ] },
];

function layerFor(node: BeliefNode): LayerId {
  if (node.tags.some((tag) => ["旧版待补证", "未确定分支", "旧版例句"].includes(tag))) return "branches";
  if (node.tags.includes("意识心焦点")) return "attention";
  if (node.tags.includes("感受线索") || node.kind === "emotion-body") return "feeling";
  if (node.kind === "value" || node.kind === "resource-core") return "values";
  if (node.kind === "limiting-core") return "core";
  if (node.kind === "rule") return "rules";
  if (["strategy", "behavior", "outcome"].includes(node.kind)) return "responses";
  if (node.kind === "bridge-belief" || node.kind === "experiment-practice") return "possibilities";
  return "context";
}

function evidenceLabel(node: BeliefNode) {
  if (node.tags.includes("未确定分支")) return "未确定";
  if (node.tags.some((tag) => ["旧版待补证", "旧版例句"].includes(tag))) return "待补证";
  if (node.provenance.includes("U0") && !node.provenance.includes("I")) return "原话支持";
  if (node.provenance.includes("I") || node.provenance.includes("Q") || node.provenance.includes("G")) {
    return "待核对";
  }
  return node.provenance.includes("A") ? "归纳" : "待核对";
}

function isUncertainBranch(node: BeliefNode) {
  return node.confidence === "low" || node.tags.some((tag) => ["旧版待补证", "未确定分支", "旧版例句"].includes(tag));
}

type PositionedNode = {
  node: BeliefNode;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  color: string;
};

function linePath(source: PositionedNode, target: PositionedNode, width: number, index: number) {
  const sx = source.x + source.width / 2;
  const tx = target.x + target.width / 2;
  if (target.layer > source.layer) {
    const sy = source.y + source.height;
    const ty = target.y;
    const bend = Math.max(24, Math.min(76, (ty - sy) * 0.4));
    return `M ${sx} ${sy} C ${sx} ${sy + bend}, ${tx} ${ty - bend}, ${tx} ${ty}`;
  }
  if (source.node.id === target.node.id) return "";
  if (target.layer === source.layer && Math.abs(source.y - target.y) < 10) {
    const leftToRight = target.x > source.x;
    const sy = source.y + source.height / 2;
    const ty = target.y + target.height / 2;
    const start = source.x + (leftToRight ? source.width : 0);
    const end = target.x + (leftToRight ? 0 : target.width);
    const mid = (start + end) / 2;
    return `M ${start} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${end} ${ty}`;
  }
  const sy = source.y + source.height / 2;
  const ty = target.y + target.height / 2;
  const lane = width - 14 - (index % 4) * 5;
  return `M ${source.x + source.width} ${sy} C ${lane} ${sy}, ${lane} ${ty}, ${target.x + target.width} ${ty}`;
}

export function SystemArchitecture({ nodes, edges, selectedId, onSelect }: ArchitectureProps) {
  const [mode, setMode] = useState<"overview" | "all" | "adjacent">("overview");
  const [showRelations, setShowRelations] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(860);
  const scrollRef = useRef<HTMLDivElement>(null);
  const markerId = useId().replace(/:/g, "");

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const validEdges = useMemo(() => edges.filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target)), [edges, nodeMap]);
  const selection = selectedId ? nodeMap.get(selectedId) : undefined;
  const adjacentEdges = useMemo(() => validEdges.filter((edge) => edge.source === selectedId || edge.target === selectedId), [validEdges, selectedId]);
  const adjacentIds = useMemo(() => new Set([selectedId, ...adjacentEdges.flatMap((edge) => [edge.source, edge.target])]), [adjacentEdges, selectedId]);
  const graphNodes = useMemo(() => mode === "adjacent" && selection ? nodes.filter((node) => adjacentIds.has(node.id)) : nodes, [mode, selection, nodes, adjacentIds]);

  const overview = useMemo(() => {
    const layers = OVERVIEW_LAYERS.map((layer) => {
      const representatives = layer.items.flatMap(([id, label]) => {
        const node = nodeMap.get(id);
        return node && !isUncertainBranch(node) ? [{ node, label }] : [];
      });
      const ids = new Set(representatives.map((item) => item.node.id));
      const fallback = nodes.filter((node) => layerFor(node) === layer.id && !isUncertainBranch(node) && !ids.has(node.id));
      const items = [...representatives, ...fallback.slice(0, Math.max(0, 2 - representatives.length)).map((node) => ({ node, label: node.label }))];
      return { ...layer, items, color: LAYERS.find((item) => item.id === layer.id)!.color };
    }).filter((layer) => layer.items.length);
    const represented = new Set(layers.flatMap((layer) => layer.items.map((item) => item.node.id)));
    return { layers, supplemental: nodes.filter((node) => !represented.has(node.id)) };
  }, [nodeMap, nodes]);

  const layout = useMemo(() => {
    const width = Math.max(704, viewportWidth);
    const columns = width >= 1060 ? 4 : 3;
    const side = 26;
    const gap = 24;
    const nodeWidth = Math.floor((width - side * 2 - gap * (columns - 1) - 18) / columns);
    const positioned: PositionedNode[] = [];
    const bands: { id: LayerId; label: string; color: string; y: number; count: number; index: number }[] = [];
    let y = 12;

    LAYERS.forEach((layer, layerIndex) => {
      const members = graphNodes.filter((node) => layerFor(node) === layer.id);
      if (!members.length) return;
      bands.push({ ...layer, y, count: members.length, index: bands.length + 1 });
      y += 49;

      for (let start = 0; start < members.length; start += columns) {
        const row = members.slice(start, start + columns);
        const heights = row.map((node) => {
          const textUnits = [...node.label].reduce((total, char) => total + (char.charCodeAt(0) > 255 ? 1 : 0.56), 0);
          const lines = Math.ceil(textUnits / Math.floor((nodeWidth - 28) / 13));
          return Math.max(88, 48 + lines * 21);
        });
        const rowHeight = Math.max(...heights);
        row.forEach((node, index) => positioned.push({ node, x: side + index * (nodeWidth + gap), y, width: nodeWidth, height: rowHeight, layer: layerIndex, color: layer.color }));
        y += rowHeight + 18;
      }
      y += 49;
    });

    return { width, height: Math.max(300, y - 18), positioned, bands, byId: new Map(positioned.map((item) => [item.node.id, item])) };
  }, [graphNodes, viewportWidth]);

  const visibleEdges = validEdges.filter((edge) => layout.byId.has(edge.source) && layout.byId.has(edge.target));
  const relationEdges = selection ? adjacentEdges : visibleEdges;

  function locateSelection() {
    if (!selectedId) return;
    if (mode === "overview") {
      const element = scrollRef.current?.querySelector<HTMLButtonElement>(`[data-node-id="${CSS.escape(selectedId)}"]`);
      if (element) {
        const details = element.closest("details");
        if (details) details.open = true;
        element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
      return;
    }
    const item = layout.byId.get(selectedId);
    if (!item || !scrollRef.current) return;
    scrollRef.current.scrollTo({ top: Math.max(0, item.y - 70), left: Math.max(0, item.x - 30), behavior: "smooth" });
  }

  return (
    <section className="system-architecture" aria-label="信念系统架构">
      <header className="architecture-heading">
        <div>
          <p className="architecture-edition">2026.09 · 对话证据版</p>
          <h2>信念系统架构</h2>
        </div>
        <p className="architecture-count"><strong>{nodes.length}</strong> 个节点<span> / </span><strong>{validEdges.length}</strong> 条关系</p>
      </header>

      <div className="architecture-toolbar">
        <div className="architecture-modes" role="group" aria-label="图谱范围">
          <button type="button" aria-pressed={mode === "overview"} onClick={() => setMode("overview")}>总览</button>
          <button type="button" aria-pressed={mode === "all"} onClick={() => setMode("all")}>节点</button>
          <button type="button" aria-pressed={mode === "adjacent"} disabled={!selection} onClick={() => setMode("adjacent")}>相邻</button>
        </div>
        <div className="architecture-toolbar-actions">
          <button type="button" className="architecture-command" disabled={!selection} onClick={locateSelection}>定位所选</button>
          <button type="button" className="architecture-command" aria-expanded={showRelations} aria-controls={`${markerId}-relations`} onClick={() => setShowRelations((value) => !value)}>关系 {showRelations ? "−" : "+"}</button>
        </div>
      </div>

      <p className="architecture-boundary">线条为关系假设；感受线索不等于固定人格或本质感觉基调。</p>

      {showRelations && (
        <div className="architecture-relations" id={`${markerId}-relations`}>
          <div className="architecture-relations-heading"><strong>{selection ? selection.label : "整体关系"}</strong><span>{relationEdges.length} 条</span></div>
          {relationEdges.length ? <ul>{relationEdges.map((edge) => (
            <li key={edge.id}>
              <div className="architecture-relation-pair">
                <button type="button" onClick={() => onSelect(edge.source)}>{nodeMap.get(edge.source)?.label}</button>
                <span aria-label={edge.bidirectional ? "双向关系" : "指向"}>{edge.bidirectional ? "↔" : "→"}</span>
                <button type="button" onClick={() => onSelect(edge.target)}>{nodeMap.get(edge.target)?.label}</button>
              </div>
              <p>{edge.label}<span> · 待核对</span></p>
            </li>
          ))}</ul> : <p className="architecture-no-relations">暂无已记录的相连关系。</p>}
        </div>
      )}

      <div className={`architecture-scroll${mode === "overview" ? " is-overview" : ""}`} ref={scrollRef} role="region" aria-label="分层信念关系图">
        {mode === "overview" ? (
          <div className="architecture-overview">
            <p className="overview-synthesis"><span>候选概括</span>成长意愿强，但行动常被准备、效益与防护条件审核。</p>
            <div className="overview-flow">
              <svg className="overview-connectors" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
                <defs><marker id={`${markerId}-overview-arrow`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="#829b9a" /></marker></defs>
                <path className="overview-axis" d="M 13 35 L 13 565" markerEnd={`url(#${markerId}-overview-arrow)`} />
                <path className="overview-feedback" d="M 952 551 L 981 551 L 981 350 L 952 350" markerEnd={`url(#${markerId}-overview-arrow)`} />
              </svg>
              <span className="overview-feedback-label">反馈假设</span>
              {overview.layers.filter((layer) => layer.id !== "context").map((layer, index) => (
                <section className="overview-layer" key={layer.id} style={{ "--layer-color": layer.color } as CSSProperties} aria-label={layer.label}>
                  <div className="overview-layer-heading"><span className="overview-sequence">{String(index + 1).padStart(2, "0")}</span><h3>{layer.label}</h3><span className="overview-qualifier">{layer.qualifier}</span></div>
                  <div className="overview-layer-nodes">{layer.items.map(({ node, label }) => (
                    <button type="button" key={node.id} className={`overview-node${node.id === selectedId ? " is-selected" : ""}`} onClick={() => onSelect(node.id)} aria-pressed={node.id === selectedId} data-node-id={node.id} title={`${node.label} · ${evidenceLabel(node)}`}><span>{label}</span></button>
                  ))}</div>
                </section>
              ))}
            </div>
            {overview.layers.filter((layer) => layer.id === "context").map((layer) => (
              <section className="overview-layer overview-context" key={layer.id} style={{ "--layer-color": layer.color } as CSSProperties} aria-label="独立的外部情境">
                <div className="overview-layer-heading"><span className="overview-sequence">↗</span><h3>{layer.label}</h3><span className="overview-qualifier">{layer.qualifier}</span></div>
                <div className="overview-layer-nodes">{layer.items.map(({ node, label }) => (
                  <button type="button" key={node.id} className={`overview-node${node.id === selectedId ? " is-selected" : ""}`} onClick={() => onSelect(node.id)} aria-pressed={node.id === selectedId} data-node-id={node.id} title={node.description}><span>{label}</span></button>
                ))}</div>
              </section>
            ))}
            {overview.supplemental.length > 0 && <details className="overview-supplemental"><summary>补充节点与未确定分支 <span>{overview.supplemental.length}</span></summary><div>{overview.supplemental.map((node) => <button type="button" key={node.id} className={`overview-supplemental-node${node.id === selectedId ? " is-selected" : ""}`} onClick={() => onSelect(node.id)} aria-pressed={node.id === selectedId} data-node-id={node.id}><span>{node.label}</span><small>{evidenceLabel(node)}</small></button>)}</div></details>}
          </div>
        ) : (
        <div className="architecture-canvas" style={{ width: layout.width, height: layout.height }}>
          <svg className="architecture-edges" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id={`${markerId}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="#697b86" /></marker>
              <marker id={`${markerId}-active-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="#a7dacd" /></marker>
            </defs>
            {visibleEdges.map((edge, index) => {
              const source = layout.byId.get(edge.source)!;
              const target = layout.byId.get(edge.target)!;
              const connected = edge.source === selectedId || edge.target === selectedId;
              const arrow = `${markerId}-${connected ? "active-arrow" : "arrow"}`;
              return <path key={edge.id} d={linePath(source, target, layout.width, index)} className={`architecture-edge${connected ? " is-connected" : selection ? " is-dimmed" : ""}`} markerEnd={`url(#${arrow})`} markerStart={edge.bidirectional ? `url(#${arrow})` : undefined}><title>{source.node.label} → {target.node.label}：{edge.label}</title></path>;
            })}
          </svg>

          {layout.bands.map((band) => <div className="architecture-layer" key={band.id} style={{ top: band.y, "--layer-color": band.color } as CSSProperties}><span className="architecture-layer-index">{String(band.index).padStart(2, "0")}</span><h3>{band.label}</h3><span className="architecture-layer-count">{band.count}</span></div>)}

          {layout.positioned.map(({ node, x, y, width, height, color }) => {
            const selected = node.id === selectedId;
            const dimmed = Boolean(selection && !adjacentIds.has(node.id));
            return (
              <button key={node.id} type="button" className={`architecture-node${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}`} style={{ left: x, top: y, width, height, "--node-color": color } as CSSProperties} onClick={() => onSelect(node.id)} aria-pressed={selected} title={node.description} data-node-id={node.id}>
                <span className="architecture-node-label">{node.label}</span>
                <span className="architecture-node-meta"><span>{DOMAINS[node.primaryDomain]}</span><span className={`architecture-evidence ${evidenceLabel(node) === "待核对" ? "is-candidate" : ""}`}>{evidenceLabel(node)}</span></span>
              </button>
            );
          })}
          {!nodes.length && <p className="architecture-empty">当前范围暂无节点。</p>}
        </div>
        )}
      </div>
    </section>
  );
}
