"use client";

import { useState, type CSSProperties, type FormEvent } from "react";

import type { BeliefNode, Domain, EdgeKind, NodeKind, TemporalLayer } from "../../lib/belief-types";
import {
  DEPTH_LABELS,
  DOMAIN_STYLE,
  EDGE_ORDER,
  EDGE_STYLE,
  KIND_ORDER,
  KIND_STYLE,
  TIME_LABELS,
} from "../../lib/belief-theme";
import { DOMAIN_ORDER } from "../../lib/layout";
import { useBeliefStore } from "../../store/belief-store";

const DEPTH_SHORT = ["价值", "核心", "规则", "策略", "表现"];
const TIME_ORDER: TemporalLayer[] = ["past", "current", "emerging"];

/** A sensible first guess for what grows out of a node on this ring. */
function suggestedNeighbour(node: BeliefNode): { kind: NodeKind; relation: EdgeKind } {
  if (node.depth <= 1) return { kind: "rule", relation: "shapes" };
  if (node.depth === 2) return { kind: "strategy", relation: "drives" };
  return { kind: "behavior", relation: "leads-to" };
}

function RatingDots({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="qe-rating" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {[1, 2, 3, 4, 5].map((step) => (
          <button
            key={step}
            type="button"
            className={step <= value ? "on" : ""}
            aria-label={`${label} ${step}/5`}
            aria-pressed={step === value}
            onClick={() => onChange(step)}
          />
        ))}
      </div>
      <b>{value}</b>
    </div>
  );
}

function AddNeighbourForm({ node, onDone, onToast }: { node: BeliefNode; onDone: () => void; onToast: (message: string) => void }) {
  const addLinkedBelief = useBeliefStore((state) => state.addLinkedBelief);
  const suggestion = suggestedNeighbour(node);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<NodeKind>(suggestion.kind);
  const [relation, setRelation] = useState<EdgeKind>(suggestion.relation);
  const [reverse, setReverse] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = `「${node.sensitive ? "敏感信念" : node.label.slice(0, 10)}」`;
  const next = `「${label.trim().slice(0, 10) || "新信念"}」`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    try {
      const id = await addLinkedBelief({ fromId: node.id, label, kind, relation, reverse });
      if (id) onToast(`已添加「${label.trim().slice(0, 16)}」，并连到${current}。`);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="qe-add" onSubmit={submit}>
      <label className="qe-field">
        <span>新信念</span>
        {/* The form only appears after an explicit click, so moving focus into it is expected. */}
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input autoFocus value={label} maxLength={400} placeholder="例如：慢一点也能做好" onChange={(event) => setLabel(event.target.value)} />
      </label>
      <div className="qe-add-grid">
        <label className="qe-field">
          <span>类型</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as NodeKind)}>
            {KIND_ORDER.map((item) => <option key={item} value={item}>{KIND_STYLE[item].label}</option>)}
          </select>
        </label>
        <label className="qe-field">
          <span>关系</span>
          <select value={relation} onChange={(event) => setRelation(event.target.value as EdgeKind)}>
            {EDGE_ORDER.map((item) => <option key={item} value={item}>{EDGE_STYLE[item].label}</option>)}
          </select>
        </label>
      </div>
      <div className="qe-sentence">
        <span>{reverse ? next : current}</span>
        <em style={{ "--edge-color": EDGE_STYLE[relation].color } as CSSProperties}>{EDGE_STYLE[relation].label} →</em>
        <span>{reverse ? current : next}</span>
        <button type="button" className="qe-swap" onClick={() => setReverse((value) => !value)} title="交换方向" aria-label="交换关系方向">⇄</button>
      </div>
      <div className="qe-add-actions">
        <button type="button" className="soft-button" onClick={onDone}>取消</button>
        <button type="submit" className="primary-button" disabled={!label.trim() || saving}>{saving ? "正在添加…" : "添加并连线"}</button>
      </div>
    </form>
  );
}

interface QuickEditorProps {
  node: BeliefNode;
  relationCount: number;
  linking: boolean;
  onStartLink: () => void;
  onOpenDetails: () => void;
  onClose: () => void;
  onToast: (message: string) => void;
}

/**
 * The everyday edits, right next to the universe: rename, move between rings,
 * time layers and domains, rate, connect and grow new neighbours. Every change
 * is saved at once and can be undone with ⌘/Ctrl+Z.
 */
export function QuickEditor({ node, relationCount, linking, onStartLink, onOpenDetails, onClose, onToast }: QuickEditorProps) {
  const updateNode = useBeliefStore((state) => state.updateNode);
  const archiveNode = useBeliefStore((state) => state.archiveNode);
  const [adding, setAdding] = useState(false);

  const patch = (changes: Partial<BeliefNode>) => updateNode(node.id, changes);
  const commitLabel = (value: string) => {
    const next = value.trim();
    if (next && next !== node.label) patch({ label: next.slice(0, 160) });
  };
  const setDomain = (domain: Domain) =>
    patch({ primaryDomain: domain, domains: Array.from(new Set([domain, ...node.domains])) });

  return (
    <section className="quick-editor" aria-label="快速编辑选中的信念" style={{ "--kind-color": KIND_STYLE[node.kind].color } as CSSProperties}>
      <header className="qe-head">
        <label className="qe-kind">
          <span className="qe-kind-dot" aria-hidden="true" />
          <select aria-label="信念类型" value={node.kind} onChange={(event) => patch({ kind: event.target.value as NodeKind })}>
            {KIND_ORDER.map((item) => <option key={item} value={item}>{KIND_STYLE[item].label}</option>)}
          </select>
        </label>
        <span className="provenance-badge" title="来源级别：U0 原话 · Q 转引 · A 归纳 · I 推断 · G 待验证">{node.provenance.join("/")}</span>
        <button type="button" className="icon-button qe-close" onClick={onClose} aria-label="取消选择（Esc）" title="取消选择（Esc）">×</button>
      </header>

      <input
        key={`${node.id}:${node.label}`}
        className="qe-title"
        aria-label="信念短标题"
        defaultValue={node.label}
        maxLength={160}
        onBlur={(event) => commitLabel(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.currentTarget.value = node.label;
            event.currentTarget.blur();
            event.stopPropagation();
          }
        }}
      />

      <div className="qe-row">
        <span className="qe-row-label">层级</span>
        <div className="qe-seg" role="group" aria-label="所在层级（离中心的距离）">
          {DEPTH_SHORT.map((label, depth) => (
            <button key={label} type="button" title={DEPTH_LABELS[depth]} aria-pressed={node.depth === depth} onClick={() => patch({ depth })}>{label}</button>
          ))}
        </div>
      </div>
      <div className="qe-row">
        <span className="qe-row-label">时间</span>
        <div className="qe-seg" role="group" aria-label="时间层（高度）">
          {TIME_ORDER.map((layer) => (
            <button key={layer} type="button" aria-pressed={node.temporalLayer === layer} onClick={() => patch({ temporalLayer: layer })}>{TIME_LABELS[layer]}</button>
          ))}
        </div>
      </div>
      <div className="qe-row">
        <span className="qe-row-label">领域</span>
        <select className="qe-select" aria-label="主要领域（方位）" value={node.primaryDomain} onChange={(event) => setDomain(event.target.value as Domain)}>
          {DOMAIN_ORDER.map((domain) => <option key={domain} value={domain}>{DOMAIN_STYLE[domain].label}</option>)}
        </select>
      </div>
      <div className="qe-ratings">
        <RatingDots label="影响" value={node.impact} onChange={(impact) => patch({ impact })} />
        <RatingDots label="强度" value={node.strength} onChange={(strength) => patch({ strength })} />
      </div>

      {adding ? (
        <AddNeighbourForm node={node} onDone={() => setAdding(false)} onToast={onToast} />
      ) : (
        <div className="qe-actions">
          <button type="button" className={`qe-action${linking ? " active" : ""}`} onClick={onStartLink} title="然后点击另一个星体">⤳ 连线</button>
          <button type="button" className="qe-action" onClick={() => setAdding(true)}>＋ 相连信念</button>
          <button type="button" className="qe-action mobile-only" onClick={onOpenDetails}>详细</button>
          <button
            type="button"
            className="qe-action danger"
            onClick={() => {
              archiveNode(node.id);
              onClose();
              onToast("已归档，可按 ⌘/Ctrl+Z 撤销。");
            }}
          >
            归档
          </button>
        </div>
      )}
      <p className="qe-foot">{relationCount} 条关系 · 改动即时保存 · ⌘/Ctrl+Z 撤销</p>
    </section>
  );
}
