"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  BeliefEdgeSchema,
  BeliefNodeSchema,
  SourceExcerptSchema,
  type BeliefEdge,
  type BeliefMap,
  type BeliefNode,
  type Confidence,
  type Domain,
  type EdgeKind,
  type NodeKind,
  type Provenance,
  type SourceExcerpt,
} from "../lib/belief-types";
import {
  parseChatGPTFile,
  type ChatGPTImportResult,
  type ImportedConversation,
} from "../lib/importers";
import {
  BeliefMapImportError,
  deserializeBeliefMap,
  serializeBeliefMap,
} from "../lib/serialization";
import { useBeliefStore, type NewBeliefChain } from "../store/belief-store";
import { SethChapterIndex, SethReference } from "./SethReference";
import { SystemArchitecture } from "./SystemArchitecture";
import { reviewCoverage } from "../lib/system-revision";

const BeliefScene = dynamic(() => import("./BeliefScene"), {
  ssr: false,
  loading: () => (
    <div className="empty-state" role="status">
      <div>
        <div className="empty-orbit" />
        <p>正在建立稳定的三维坐标…</p>
      </div>
    </div>
  ),
});

const DOMAIN_INFO: Record<Domain, { label: string; color: string }> = {
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

const DOMAIN_ORDER = Object.keys(DOMAIN_INFO) as Domain[];

const KIND_LABELS: Record<NodeKind, string> = {
  value: "价值方向",
  "resource-core": "资源性核心",
  "limiting-core": "限制性核心",
  rule: "条件规则",
  strategy: "保护策略",
  "bridge-belief": "桥梁信念",
  trigger: "触发",
  "emotion-body": "情绪 / 身体",
  behavior: "行为",
  outcome: "结果",
  evidence: "证据",
  "source-event": "来源 / 事件",
  "experiment-practice": "小验证",
};

const KIND_COLORS: Partial<Record<NodeKind, string>> = {
  value: "#e2bf6a",
  "resource-core": "#82d8c5",
  "limiting-core": "#df807a",
  rule: "#6ab2df",
  strategy: "#9a8cf1",
  "bridge-belief": "#72d6cb",
  trigger: "#f0a576",
  "emotion-body": "#d88da7",
  behavior: "#a58aca",
  outcome: "#7f9fc4",
};

const PROVENANCE_LABELS: Record<Provenance, string> = {
  U0: "已核对用户原话",
  Q: "助手转引·待回原对话核对",
  A: "助手归纳",
  I: "助手推断·待审视",
  G: "桥梁假设·待验证",
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
};

const EDGE_LABELS: Record<EdgeKind, string> = {
  "originated-from": "源自",
  activates: "触发",
  "leads-to": "导致",
  supports: "支持",
  "conflicts-with": "与…冲突",
  shapes: "塑造",
  protects: "保护需要",
  drives: "驱动",
  reinforces: "强化",
  challenges: "质疑",
  reframes: "重构",
  tests: "验证",
};

type DialogName = "add" | "import" | "chapters" | undefined;
type BridgeStatus = {
  available: boolean;
  loggedIn: boolean;
  version?: string;
  message?: string;
};

function clampRating(value: number) {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function nodeRating(node: BeliefNode, field: "impact" | "strength") {
  return clampRating(node[field] ?? 3);
}

function displayDate(value?: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function safeDomId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function hasWebGL2() {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

function DialogFrame({
  title,
  description,
  wide,
  children,
  footer,
  onClose,
}: {
  title: string;
  description: string;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const titleId = `dialog-${safeDomId(title)}`;
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭对话框">
            ×
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer ? <footer className="dialog-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

function AddBeliefDialog({ onClose }: { onClose: () => void }) {
  const addBeliefChain = useBeliefStore((state) => state.addBeliefChain);
  const setViewMode = useBeliefStore((state) => state.setViewMode);
  const [form, setForm] = useState<NewBeliefChain>({
    belief: "",
    domain: "self",
    trigger: "",
    behavior: "",
    outcome: "",
    impact: 3,
    strength: 3,
    sensitive: false,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.belief.trim()) return;
    setSaving(true);
    try {
      await addBeliefChain({ ...form, belief: form.belief.trim() });
      setViewMode("3d");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogFrame
      title="记录一条信念"
      description="从一句“我相信…”开始。触发、行为和结果可以先留空，以后再补。"
      onClose={onClose}
      footer={
        <>
          <span className="tiny-copy">保存后会自动建立一条可编辑的因果链。</span>
          <div>
            <button className="soft-button" type="button" onClick={onClose}>取消</button>
            <button className="primary-button" type="submit" form="add-belief-form" disabled={!form.belief.trim() || saving}>
              {saving ? "正在放入宇宙…" : "建立信念链"}
            </button>
          </div>
        </>
      }
    >
      <form id="add-belief-form" onSubmit={submit}>
        <div className="wizard-step">
          <span className="step-number">01</span>
          <div>
            <h3>你此刻相信什么？</h3>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="new-belief">信念句</label>
                <textarea
                  id="new-belief"
                  required
                  placeholder="例如：只有弄清所有变量，我才能安全行动。"
                  value={form.belief}
                  onChange={(event) => setForm((current) => ({ ...current, belief: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="new-domain">主要领域</label>
                <select
                  id="new-domain"
                  value={form.domain}
                  onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value as Domain }))}
                >
                  {DOMAIN_ORDER.map((domain) => <option key={domain} value={domain}>{DOMAIN_INFO[domain].label}</option>)}
                </select>
              </div>
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={form.sensitive}
                  onChange={(event) => setForm((current) => ({ ...current, sensitive: event.target.checked }))}
                />
                <span>这条信念含有敏感内容，证据需要二次点击才显示。</span>
              </label>
            </div>
          </div>
        </div>
        <div className="wizard-step">
          <span className="step-number">02</span>
          <div>
            <h3>它在什么时候启动，又把你带到哪里？</h3>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="new-trigger">情境 / 触发</label>
                <input id="new-trigger" placeholder="当我面对一个没有标准答案的选择时…" value={form.trigger} onChange={(event) => setForm((current) => ({ ...current, trigger: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="new-behavior">常见行动</label>
                <textarea id="new-behavior" placeholder="继续搜索、比较、推迟决定…" value={form.behavior} onChange={(event) => setForm((current) => ({ ...current, behavior: event.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="new-outcome">通常结果</label>
                <textarea id="new-outcome" placeholder="短期放心，但行动更晚了…" value={form.outcome} onChange={(event) => setForm((current) => ({ ...current, outcome: event.target.value }))} />
              </div>
            </div>
          </div>
        </div>
        <div className="wizard-step">
          <span className="step-number">03</span>
          <div>
            <h3>先记录当下的主观感受，以后可以反复校准。</h3>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="new-impact">影响范围：{form.impact} / 5</label>
                <input id="new-impact" type="range" min="1" max="5" value={form.impact} onChange={(event) => setForm((current) => ({ ...current, impact: Number(event.target.value) }))} />
              </div>
              <div className="field">
                <label htmlFor="new-strength">当前强度：{form.strength} / 5</label>
                <input id="new-strength" type="range" min="1" max="5" value={form.strength} onChange={(event) => setForm((current) => ({ ...current, strength: Number(event.target.value) }))} />
              </div>
            </div>
          </div>
        </div>
      </form>
    </DialogFrame>
  );
}

function ImportDialog({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const currentMap = useBeliefStore((state) => state.map);
  const replaceMap = useBeliefStore((state) => state.replaceMap);
  const mergeGraph = useBeliefStore((state) => state.mergeGraph);
  const mergeEvidenceMap = useBeliefStore((state) => state.mergeEvidenceMap);
  const analyzedBatchHashes = useBeliefStore((state) => state.analyzedBatchHashes);
  const markBatchAnalyzed = useBeliefStore((state) => state.markBatchAnalyzed);
  const markBackup = useBeliefStore((state) => state.markBackup);
  const [source, setSource] = useState<ChatGPTImportResult>();
  const [mapCandidate, setMapCandidate] = useState<BeliefMap>();
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const analysisAbortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => analysisAbortRef.current?.abort(), []);

  const cancelAnalysis = () => {
    if (!analysisAbortRef.current) return;
    analysisAbortRef.current.abort();
    setError("正在取消本批分析；已经完成的批次会保留。");
  };

  const closeDialog = () => {
    analysisAbortRef.current?.abort();
    onClose();
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setError(undefined);
    setSource(undefined);
    setMapCandidate(undefined);
    setProgress(0);
    const text = file.name.toLowerCase().endsWith(".json") ? await file.text() : undefined;
    if (text) {
      try {
        const map = deserializeBeliefMap(text);
        setMapCandidate(map);
        return;
      } catch (importError) {
        if (importError instanceof BeliefMapImportError && !text.includes("mapping")) {
          setError(importError.issues.slice(0, 3).join("；"));
        }
      }
    }
    try {
      const parsed = await parseChatGPTFile(file);
      setSource(parsed);
      setError(undefined);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "无法读取这个文件。");
    }
  };

  const restoreMap = () => {
    if (!mapCandidate) return;
    downloadText(`信念宇宙-替换前自动备份-${new Date().toISOString().slice(0, 10)}.json`, serializeBeliefMap(currentMap));
    markBackup();
    replaceMap(mapCandidate);
    onToast(`已恢复 ${mapCandidate.nodes.length} 个节点，旧图谱已自动下载备份。`);
    onClose();
  };

  const saveSourcesLocally = () => {
    if (!source?.map) return;
    mergeEvidenceMap(source.map);
    onToast(
      `已把 ${source.map.sourceExcerpts.length} 条原始消息保存到本机来源库；没有发起 AI 分析。`,
    );
  };

  const analyze = async () => {
    if (!source || !consent || analyzing) return;
    setAnalyzing(true);
    setProgress(1);
    setAnalysisWarnings([]);
    const batches = await createAnalysisBatches(source.conversations);
    const pendingBatches = batches.filter((batch) => !analyzedBatchHashes.includes(batch.hash));
    if (source.map) mergeEvidenceMap(source.map);
    if (!pendingBatches.length) {
      onToast("这些对话批次均已分析；未重复消耗 Codex 额度。");
      setProgress(100);
      setAnalyzing(false);
      return;
    }
    const warnings: string[] = [];
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    try {
      for (let index = 0; index < pendingBatches.length; index += 1) {
        const batch = pendingBatches[index];
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversations: batch.conversations }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `分析服务返回 ${response.status}`);
        }
        const result = await readAnalysisResponse(response);
        const normalized = await normalizeAiResult(result, currentMap, index);
        if (normalized.nodes.length || normalized.edges.length || normalized.excerpts.length) {
          mergeGraph(normalized.nodes, normalized.edges, normalized.excerpts);
        }
        await markBatchAnalyzed(batch.hash);
        warnings.push(...normalized.warnings);
        setProgress(Math.round(((index + 1) / pendingBatches.length) * 100));
      }
      setAnalysisWarnings(warnings);
      onToast("分析已完成：新节点均保留来源级别与置信度。");
    } catch (analysisError) {
      setError(
        controller.signal.aborted
          ? "分析已取消；已完成批次保留，当前批次的 Codex 进程已终止。"
          : analysisError instanceof Error
            ? analysisError.message
            : "AI 分析中断，现有图谱未被覆盖。",
      );
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = undefined;
      setAnalyzing(false);
    }
  };

  const coverage = source?.coverage;

  return (
    <DialogFrame
      title="导入历史对话"
      description="先在本机校验文件和覆盖范围，不会因为文件名看起来正确就宣称“已扫描全部历史”。"
      wide
      onClose={closeDialog}
      footer={
        <>
          <span className="tiny-copy">{fileName ? `当前文件：${fileName}` : "支持 ChatGPT ZIP、conversations.json、TXT 与信念图谱 JSON"}</span>
          <div>
            {analyzing
              ? <button className="danger-button" type="button" onClick={cancelAnalysis}>取消分析</button>
              : <button className="soft-button" type="button" onClick={closeDialog}>关闭</button>}
            {mapCandidate ? <button className="primary-button" onClick={restoreMap}>备份并替换图谱</button> : null}
            {source && !analyzing ? <button className="soft-button" onClick={saveSourcesLocally}>仅保存来源到本机</button> : null}
            {source ? <button className="primary-button" onClick={analyze} disabled={!consent || analyzing || source.conversations.length === 0}>{analyzing ? "分析中…" : "开始 AI 分析"}</button> : null}
          </div>
        </>
      }
    >
      <label className="dropzone">
        <input type="file" accept=".zip,.json,.txt,application/zip,application/json,text/plain" onChange={(event) => void handleFile(event.target.files?.[0])} />
        <span>
          <strong>选择 ChatGPT 导出或本地备份</strong>
          ZIP 会先验证 conversations.json；TXT 仅作补充资料。
        </span>
      </label>

      {error ? <div className="warning-box" role="alert">{error}</div> : null}

      {mapCandidate ? (
        <>
          <div className="success-box">已通过 BeliefMap v{mapCandidate.schemaVersion} 完整性校验。替换前会自动下载当前图谱。</div>
          <div className="import-summary">
            <div className="summary-cell"><strong>{mapCandidate.nodes.length}</strong><span>节点</span></div>
            <div className="summary-cell"><strong>{mapCandidate.edges.length}</strong><span>关系</span></div>
            <div className="summary-cell"><strong>{mapCandidate.sourceExcerpts.length}</strong><span>证据</span></div>
            <div className="summary-cell"><strong>{mapCandidate.checkIns.length}</strong><span>变化记录</span></div>
          </div>
        </>
      ) : null}

      {source && coverage ? (
        <>
          <div className="import-summary">
            <div className="summary-cell"><strong>{coverage.conversationCount}</strong><span>对话</span></div>
            <div className="summary-cell"><strong>{coverage.uniqueMessageCount}</strong><span>唯一消息</span></div>
            <div className="summary-cell"><strong>{coverage.duplicateMessageCount}</strong><span>已去重</span></div>
            <div className="summary-cell"><strong>{coverage.emptyMessageCount}</strong><span>空消息</span></div>
          </div>
          <div className="success-box">
            时间范围：{displayDate(coverage.earliestAt)} — {displayDate(coverage.latestAt)}。
            已接受 {coverage.filesAccepted}/{coverage.filesSeen} 个来源文件。
          </div>
          {coverage.warnings.length ? <div className="warning-box">{coverage.warnings.join("；")}</div> : null}
          <div className="privacy-box">
            原始文本与图谱存在你的浏览器本机数据库。只有点击“开始 AI 分析”后，导入的对话批次才会经已登录的 Codex 发送给 OpenAI 处理。
          </div>
          <label className="consent-row">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>我理解上述边界，并由我主动发起这次分析。第三方姓名、公司、项目号和邮箱将按原文处理。</span>
          </label>
          {analyzing || progress > 0 ? <><div className="progress-track" aria-label={`分析进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div><p className="tiny-copy">已完成 {progress}%。中途失败不会覆盖现有图谱。</p></> : null}
          {analysisWarnings.length ? <div className="warning-box">{analysisWarnings.join("；")}</div> : null}
        </>
      ) : null}
    </DialogFrame>
  );
}

function OutlineView({ nodes, selectedId, onSelect }: { nodes: BeliefNode[]; selectedId?: string; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    const next = new Map<NodeKind, BeliefNode[]>();
    for (const node of nodes) next.set(node.kind, [...(next.get(node.kind) ?? []), node]);
    return [...next.entries()];
  }, [nodes]);
  return (
    <div className="outline-view" aria-label="信念图谱二维大纲">
      <div className="outline-groups">
        {groups.map(([kind, groupNodes]) => (
          <section className="outline-group" key={kind}>
            <h2>{KIND_LABELS[kind]} · {groupNodes.length}</h2>
            {groupNodes.map((node) => (
              <button key={node.id} className={`outline-node${selectedId === node.id ? " selected" : ""}`} onClick={() => onSelect(node.id)}>
                <span className="domain-dot" style={{ "--domain-color": KIND_COLORS[node.kind] ?? "#82d8c5" } as React.CSSProperties} />
                <span><strong>{node.label}</strong><small>{node.sensitive ? "敏感·" : ""}{DOMAIN_INFO[node.primaryDomain].label} · {CONFIDENCE_LABELS[node.confidence]}</small></span>
                <span className="provenance-badge">{node.provenance.join("/")}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Inspector({
  node,
  map,
  onCloseMobile,
  onToast,
}: {
  node?: BeliefNode;
  map: BeliefMap;
  onCloseMobile: () => void;
  onToast: (message: string) => void;
}) {
  const select = useBeliefStore((state) => state.select);
  const updateNode = useBeliefStore((state) => state.updateNode);
  const archiveNode = useBeliefStore((state) => state.archiveNode);
  const addEdge = useBeliefStore((state) => state.addEdge);
  const addCheckIn = useBeliefStore((state) => state.addCheckIn);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<BeliefNode>>(node ?? {});
  const [revealed, setRevealed] = useState<string[]>([]);
  const [relationTarget, setRelationTarget] = useState("");
  const [relationKind, setRelationKind] = useState<EdgeKind>("supports");
  const [checkStrength, setCheckStrength] = useState(node ? nodeRating(node, "strength") : 3);
  const [checkActivation, setCheckActivation] = useState(3);
  const [checkNote, setCheckNote] = useState("");

  if (!node) {
    return (
      <div className="empty-state">
        <div>
          <div className="empty-orbit" />
          <h2>选择一个节点</h2>
          <p>尚未选择节点。</p>
        </div>
      </div>
    );
  }

  const relations = map.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const excerpts = map.sourceExcerpts.filter((excerpt) => node.sourceExcerptIds.includes(excerpt.id));
  const checkIns = map.checkIns.filter((item) => item.nodeId === node.id).sort((a, b) => b.at.localeCompare(a.at));
  const saveEdit = () => {
    const primaryDomain = (draft.primaryDomain ?? node.primaryDomain) as Domain;
    updateNode(node.id, {
      label: String(draft.label ?? node.label).trim() || node.label,
      description: String(draft.description ?? node.description).trim() || node.description,
      primaryDomain,
      domains: Array.from(new Set([primaryDomain, ...(draft.domains ?? node.domains)])),
      impact: clampRating(Number(draft.impact ?? node.impact)),
      strength: clampRating(Number(draft.strength ?? node.strength)),
      sensitive: Boolean(draft.sensitive),
      status: draft.status ?? node.status,
    });
    setEditing(false);
    onToast("已保存；语义层级未因拖动位置而改变。");
  };

  return (
    <div className="inspector-scroll">
      <button className="icon-button mobile-only panel-mobile-close" onClick={onCloseMobile} aria-label="关闭详情面板">×</button>
      <div className="inspector-topline">
        <span className="tag">{KIND_LABELS[node.kind]}</span>
        <span className="provenance-badge" title={node.provenance.map((item) => PROVENANCE_LABELS[item]).join("；")}>{node.provenance.join("/")}</span>
        <span className={`confidence-badge ${node.confidence}`}>{CONFIDENCE_LABELS[node.confidence]}</span>
      </div>

      {editing ? (
        <div className="form-grid">
          <div className="field full"><label htmlFor="edit-label">短标题</label><input id="edit-label" value={String(draft.label ?? "")} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} /></div>
          <div className="field full"><label htmlFor="edit-description">信念全文 / 解释</label><textarea id="edit-description" value={String(draft.description ?? "")} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
          <div className="field"><label htmlFor="edit-domain">主要领域</label><select id="edit-domain" value={String(draft.primaryDomain ?? node.primaryDomain)} onChange={(event) => setDraft((current) => ({ ...current, primaryDomain: event.target.value as Domain }))}>{DOMAIN_ORDER.map((domain) => <option key={domain} value={domain}>{DOMAIN_INFO[domain].label}</option>)}</select></div>
          <div className="field"><label htmlFor="edit-status">状态</label><select id="edit-status" value={String(draft.status ?? node.status)} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as BeliefNode["status"] }))}><option value="active">活跃</option><option value="under-review">待审视</option><option value="emerging">正在形成</option><option value="candidate">候选</option><option value="archived">已归档</option></select></div>
          <div className="field"><label htmlFor="edit-impact">影响 {draft.impact ?? node.impact}/5</label><input id="edit-impact" type="range" min="1" max="5" value={Number(draft.impact ?? node.impact)} onChange={(event) => setDraft((current) => ({ ...current, impact: Number(event.target.value) }))} /></div>
          <div className="field"><label htmlFor="edit-strength">强度 {draft.strength ?? node.strength}/5</label><input id="edit-strength" type="range" min="1" max="5" value={Number(draft.strength ?? node.strength)} onChange={(event) => setDraft((current) => ({ ...current, strength: Number(event.target.value) }))} /></div>
          <label className="consent-row full"><input type="checkbox" checked={Boolean(draft.sensitive)} onChange={(event) => setDraft((current) => ({ ...current, sensitive: event.target.checked }))} /><span>敏感内容：证据需二次揭示。</span></label>
        </div>
      ) : (
        <>
          <h2>{node.label}</h2>
          <p className="inspector-meta">{node.description}</p>
        </>
      )}

      <div className="inspector-actions">
        {editing ? <><button className="primary-button" onClick={saveEdit}>保存修改</button><button className="soft-button" onClick={() => { setDraft(node); setEditing(false); }}>取消</button></> : <button className="soft-button" onClick={() => setEditing(true)}>编辑这个节点</button>}
      </div>

      <section className="inspector-section">
        <h3>当前轮廓</h3>
        <div className="bar-row"><span>影响范围</span><div className="meter"><span style={{ width: `${nodeRating(node, "impact") * 20}%` }} /></div><b>{nodeRating(node, "impact")}</b></div>
        <div className="bar-row"><span>当前强度</span><div className="meter"><span style={{ width: `${nodeRating(node, "strength") * 20}%` }} /></div><b>{nodeRating(node, "strength")}</b></div>
        <p className="tiny-copy">{node.tags.includes("对话核对版") ? "初始数值尚未由你评分，只是显示占位。" : "初始值来自旧版整理，可按实际体验修改。"} 位置与数值不是心理测量。</p>
      </section>

      <section className="inspector-section">
        <h3>关系 · {relations.length}</h3>
        <div className="relation-list">
          {relations.map((edge) => {
            const otherId = edge.source === node.id ? edge.target : edge.source;
            const other = map.nodes.find((candidate) => candidate.id === otherId);
            if (!other) return null;
            return <button className="relation-item" key={edge.id} onClick={() => select(other.id)}><small>{EDGE_LABELS[edge.kind]}</small><span>{other.label}</span></button>;
          })}
          {!relations.length ? <p className="tiny-copy">还没有关系。可以在下方选择另一节点建立连接。</p> : null}
        </div>
        <div className="form-grid" style={{ marginTop: 11 }}>
          <div className="field"><label htmlFor="relation-kind">关系</label><select id="relation-kind" value={relationKind} onChange={(event) => setRelationKind(event.target.value as EdgeKind)}>{Object.entries(EDGE_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></div>
          <div className="field"><label htmlFor="relation-target">目标节点</label><select id="relation-target" value={relationTarget} onChange={(event) => setRelationTarget(event.target.value)}><option value="">请选择…</option>{map.nodes.filter((candidate) => candidate.id !== node.id && candidate.status !== "archived").map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></div>
        </div>
        <button className="soft-button" style={{ marginTop: 8 }} disabled={!relationTarget} onClick={() => { addEdge(node.id, relationTarget, relationKind, EDGE_LABELS[relationKind]); setRelationTarget(""); onToast("关系已建立。"); }}>建立关系</button>
      </section>

      <section className="inspector-section">
        <h3>证据与来源 · {excerpts.length}</h3>
        {excerpts.map((excerpt) => {
          const isRevealed = revealed.includes(excerpt.id) || !excerpt.sensitive;
          return (
            <details className="evidence-item" key={excerpt.id}>
              <summary><span>{excerpt.conversationTitle ?? PROVENANCE_LABELS[excerpt.provenance]}</span><small>{displayDate(excerpt.createdAt)}</small></summary>
              <div className="evidence-copy">
                {isRevealed ? excerpt.text : <div className="sensitive-mask"><button className="soft-button" onClick={() => setRevealed((current) => [...current, excerpt.id])}>揭示敏感原文</button></div>}
              </div>
              {isRevealed && excerpt.confidenceNote ? <p className="tiny-copy">{excerpt.confidenceNote}</p> : null}
              {excerpt.conversationId ? <a className="evidence-origin" href={excerpt.conversationId.startsWith("01") ? `codex://threads/${encodeURIComponent(excerpt.conversationId)}` : `https://chatgpt.com/c/${encodeURIComponent(excerpt.conversationId)}`} target="_blank" rel="noreferrer">查看原对话</a> : null}
            </details>
          );
        })}
        {!excerpts.length ? <p className="tiny-copy">没有可核对的原文。这条内容不应被当作已证实的用户信念。</p> : null}
        {node.confidenceNote ? <div className="warning-box">{node.confidenceNote}</div> : null}
      </section>

      <section className="inspector-section">
        <SethReference domain={node.primaryDomain} kind={`${node.kind} ${node.temporalLayer}`} />
      </section>

      <section className="inspector-section">
        <h3>当下 Check-in</h3>
        <div className="checkin-box">
          <div className="range-header"><span>这条信念现在有多强？</span><b>{checkStrength}/5</b></div>
          <input type="range" min="1" max="5" value={checkStrength} onChange={(event) => setCheckStrength(Number(event.target.value))} />
          <div className="range-header"><span>它此刻有多活跃？</span><b>{checkActivation}/5</b></div>
          <input type="range" min="1" max="5" value={checkActivation} onChange={(event) => setCheckActivation(Number(event.target.value))} />
          <div className="field"><label htmlFor="checkin-note">此刻的情境（可选）</label><textarea id="checkin-note" value={checkNote} onChange={(event) => setCheckNote(event.target.value)} placeholder="今天发生了什么，你是怎样回应的？" /></div>
          <button className="primary-button" onClick={() => { addCheckIn(node.id, checkStrength / 5, checkActivation / 5, checkNote); setCheckNote(""); onToast("Check-in 已记录，历史强度没有被覆盖。"); }}>记录本次变化</button>
          {checkIns.slice(0, 3).map((item) => <p className="tiny-copy" key={item.id}>{displayDate(item.at)} · 强度 {Math.round(item.strength * 5)}/5 · 活跃 {Math.round(item.activation * 5)}/5{item.note ? ` · ${item.note}` : ""}</p>)}
        </div>
      </section>

      <section className="inspector-section">
        <button className="danger-button" onClick={() => { archiveNode(node.id); select(undefined); onToast("节点已归档，可用“撤销”恢复。"); }}>归档这个节点</button>
      </section>
    </div>
  );
}

export function BeliefUniverseApp() {
  const {
    map,
    hydrated,
    storageError,
    selectedId,
    query,
    domains,
    viewMode,
    focusMode,
    showBridges,
    reducedMotion,
    lastBackupAt,
    undoStack,
    hydrate,
    select,
    setQuery,
    toggleDomain,
    clearDomains,
    setViewMode,
    setFocusMode,
    toggleBridges,
    setReducedMotion,
    undo,
    markBackup,
  } = useBeliefStore();
  const [dialog, setDialog] = useState<DialogName>();
  const [toast, setToast] = useState<string>();
  const [webgl, setWebgl] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ available: false, loggedIn: false, message: "检查中" });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), 3600);
  };

  useEffect(() => {
    void hydrate();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motion.matches);
    requestAnimationFrame(() => {
      const supported = hasWebGL2();
      setWebgl(supported);
      if (!supported && useBeliefStore.getState().viewMode === "3d") setViewMode("2d");
    });
    const onMotion = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    motion.addEventListener("change", onMotion);
    return () => motion.removeEventListener("change", onMotion);
  }, [hydrate, setReducedMotion, setViewMode]);

  useEffect(() => {
    fetch("/api/status")
      .then(async (response) => response.ok ? response.json() as Promise<BridgeStatus> : Promise.reject(new Error()))
      .then((status) => setBridgeStatus(status))
      .catch(() => setBridgeStatus({ available: false, loggedIn: false, message: "请使用本机启动器" }));
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const visibleNodes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return map.nodes.filter((node) => {
      if (node.status === "archived") return false;
      if (domains.length && !domains.some((domain) => node.domains.includes(domain))) return false;
      if (!showBridges && node.kind === "bridge-belief") return false;
      if (!normalized) return true;
      return `${node.label} ${node.description} ${node.tags.join(" ")}`.toLocaleLowerCase("zh-CN").includes(normalized);
    });
  }, [domains, map.nodes, query, showBridges]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => map.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)), [map.edges, visibleIds]);
  const selectedNode = map.nodes.find((node) => node.id === selectedId && node.status !== "archived");
  const emergingCount = map.nodes.filter((node) => node.temporalLayer === "emerging" && node.status !== "archived").length;
  const domainCounts = useMemo(() => new Map(DOMAIN_ORDER.map((domain) => [domain, map.nodes.filter((node) => node.status !== "archived" && node.domains.includes(domain)).length])), [map.nodes]);
  const provenanceCounts = useMemo(() => new Map((Object.keys(PROVENANCE_LABELS) as Provenance[]).map((provenance) => [provenance, map.nodes.filter((node) => node.provenance.includes(provenance) && node.status !== "archived").length])), [map.nodes]);
  const reviewed = reviewCoverage(map);

  const backup = () => {
    downloadText(`信念宇宙-本机备份-${new Date().toISOString().slice(0, 10)}.json`, serializeBeliefMap(map));
    markBackup();
    notify("完整 JSON 备份已下载；其中含未脱敏证据原文。");
  };

  if (!hydrated) {
    return <main className="belief-app"><div className="empty-state" role="status"><div><div className="empty-orbit" /><h2>正在打开本机信念库</h2><p>不会连接公共服务器。</p></div></div></main>;
  }

  return (
    <main className={`belief-app${viewMode === "system" ? " system-mode" : ""}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-orbit" aria-hidden="true" /><span className="brand-copy"><strong>信念宇宙</strong><span>Belief Atlas · Local</span></span></div>
        <span className="local-chip">仅此 Mac</span>
        <div className="view-switch" aria-label="视图切换"><button className={viewMode === "system" ? "active" : ""} onClick={() => setViewMode("system")}>系统架构</button><button className={viewMode === "3d" ? "active" : ""} onClick={() => webgl && setViewMode("3d")} disabled={!webgl}>3D 宇宙</button><button className={viewMode === "2d" ? "active" : ""} onClick={() => setViewMode("2d")}>2D 大纲</button></div>
        <div className="topbar-spacer" />
        <button className="top-action mobile-only" aria-label="打开筛选面板" onClick={() => setSidebarOpen(true)}>≡</button>
        <button className="top-action ai-button" onClick={() => setDialog("import")} title={bridgeStatus.message}><span className="status-dot" style={{ background: bridgeStatus.loggedIn ? "#82d8c5" : "#f0a576" }} /><span className="desktop-label">{bridgeStatus.loggedIn ? "Codex 已就绪" : "AI 更新图谱"}</span></button>
        <button className="top-action primary" onClick={() => setDialog("add")}><span>＋</span><span className="desktop-label">记录新信念</span></button>
        <button className="top-action mobile-only" aria-label="打开节点详情" onClick={() => setInspectorOpen(true)} disabled={!selectedNode}>◎</button>
      </header>

      <div className="app-grid">
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`} aria-label="探索与筛选">
          <button className="icon-button mobile-only panel-mobile-close" onClick={() => setSidebarOpen(false)} aria-label="关闭筛选面板">×</button>
          <div className="sidebar-scroll">
            <label className="search-box"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索信念、领域或标签" /></label>
            <div className="metrics"><div className="metric"><strong>{map.nodes.filter((node) => node.status !== "archived").length}</strong><span>节点</span></div><div className="metric"><strong>{map.edges.length}</strong><span>关系</span></div><div className="metric"><strong>{emergingCount}</strong><span>形成中</span></div></div>

            <section className="sidebar-section">
              <div className="section-title"><span>生活领域</span>{domains.length ? <button onClick={clearDomains}>清空</button> : null}</div>
              <div className="domain-list">{DOMAIN_ORDER.map((domain) => <button key={domain} className={`domain-filter${!domains.length || domains.includes(domain) ? " active" : ""}`} onClick={() => toggleDomain(domain)}><span className="domain-dot" style={{ "--domain-color": DOMAIN_INFO[domain].color } as React.CSSProperties} /><span>{DOMAIN_INFO[domain].label}</span><small>{domainCounts.get(domain) ?? 0}</small></button>)}</div>
            </section>

            <section className="sidebar-section">
              <div className="section-title"><span>证据级别</span></div>
              <div className="filter-list">{(Object.keys(PROVENANCE_LABELS) as Provenance[]).map((provenance) => <div className="compact-filter" key={provenance} title={PROVENANCE_LABELS[provenance]}><span className={`filter-mark${provenance === "I" || provenance === "G" ? " dashed" : provenance === "U0" ? " glow" : ""}`} /><span>{provenance} · {PROVENANCE_LABELS[provenance]}</span><small>{provenanceCounts.get(provenance) ?? 0}</small></div>)}</div>
            </section>

            <section className="sidebar-section">
              <div className="section-title"><span>对话覆盖</span></div>
              <div className="coverage-card">
                <strong>{reviewed.direct ? "已核对选定历史与本轮自述" : map.coverage?.sourceType === "curated-seed" ? "结构化初始整理" : "已导入本地对话"}</strong>
                <p>{reviewed.direct ? `${reviewed.conversations} 个对话 · ${reviewed.direct} 段直接摘录 · ${reviewed.quoted} 段旧文转引。覆盖为选定材料，并非全部历史。` : map.coverage ? `${map.coverage.conversationCount} 个对话 · ${map.coverage.uniqueMessageCount} 条唯一消息` : "尚未核对全部历史。"}</p>
                <button className="text-button" onClick={() => setDialog("import")}>导入并核验对话 →</button>
              </div>
            </section>

            <section className="sidebar-section">
              <div className="section-title"><span>本机安全</span></div>
              {storageError ? <div className="warning-box">{storageError}</div> : null}
              <p className="tiny-copy">浏览器数据被清理时，本地图谱也可能被删除。备份中含你选择保留的完整原文。</p>
              <div className="sidebar-footer-actions"><button className="soft-button" onClick={backup}>导出备份</button><button className="soft-button" onClick={undo} disabled={!undoStack.length}>撤销</button></div>
              <p className="tiny-copy">最近备份：{lastBackupAt ? displayDate(lastBackupAt) : "尚未备份"}</p>
            </section>
          </div>
        </aside>

        <section className="universe-stage" aria-label="信念宇宙主视图">
          {viewMode !== "system" ? <><div className="scene-heading"><div className="section-kicker">核心层级网络 · 可修改导航隐喻</div><h1>你的信念宇宙</h1><p>中心 → 核心信念 / 外环 → 规则与表现 / 高度 → 过去·当下·形成中</p></div>
          <div className="scene-tools"><button className={`scene-tool${focusMode === "neighbors" ? " active" : ""}`} onClick={() => setFocusMode(focusMode === "all" ? "neighbors" : "all")} title="只显示选中节点的相邻关系">◉</button><button className={`scene-tool${showBridges ? " active" : ""}`} onClick={toggleBridges} title="显示或隐藏桥梁信念">≋</button><button className="scene-tool" onClick={() => setDialog("chapters")} title="赛斯章节索引">§</button></div>
          <div className="timeline-axis">形成中 / 当下 / 来源
          </div></> : null}
          {viewMode === "system" ? <SystemArchitecture nodes={visibleNodes} edges={visibleEdges} selectedId={selectedId} onSelect={(id) => { select(id); setInspectorOpen(true); }} /> : viewMode === "3d" && webgl ? <div className="scene-canvas"><BeliefScene nodes={visibleNodes} edges={visibleEdges} selectedId={selectedId} onSelect={(id) => { select(id); setInspectorOpen(true); }} focusMode={focusMode} reducedMotion={reducedMotion} showBridges={showBridges} /></div> : <OutlineView nodes={visibleNodes} selectedId={selectedId} onSelect={(id) => { select(id); setInspectorOpen(true); }} />}
          {viewMode !== "system" ? <>
          <div className="scene-legend" aria-label="图例"><span><i className="legend-shape" style={{ "--domain-color": KIND_COLORS.value } as React.CSSProperties} />价值</span><span><i className="legend-shape" style={{ "--domain-color": KIND_COLORS["resource-core"] } as React.CSSProperties} />资源核心</span><span><i className="legend-shape" style={{ "--domain-color": KIND_COLORS["limiting-core"] } as React.CSSProperties} />限制核心</span><span><i className="legend-shape" style={{ "--domain-color": KIND_COLORS.rule } as React.CSSProperties} />条件规则</span><span><i className="legend-shape" style={{ "--domain-color": KIND_COLORS.strategy } as React.CSSProperties} />保护策略</span><span><i className="legend-shape" style={{ "--domain-color": KIND_COLORS["bridge-belief"] } as React.CSSProperties} />桥梁假设</span></div>
          <div className="scene-notice">位置不是客观心理测量。节点可修改、可归档，推断和桥梁信念必须保留 I / G 标记。</div>
          </> : null}
        </section>

        <aside className={`inspector${inspectorOpen ? " open" : ""}`} aria-label="节点详情与编辑"><Inspector key={selectedNode?.id ?? "empty"} node={selectedNode} map={map} onCloseMobile={() => setInspectorOpen(false)} onToast={notify} /></aside>
      </div>

      {dialog === "add" ? <AddBeliefDialog onClose={() => setDialog(undefined)} /> : null}
      {dialog === "import" ? <ImportDialog onClose={() => setDialog(undefined)} onToast={notify} /> : null}
      {dialog === "chapters" ? <DialogFrame title="赛斯章节导航" description="以你 Google Drive 中的《个人实相的本质》为主要解释框架；这些是对照线索，不是诊断或绝对结论。" wide onClose={() => setDialog(undefined)}><SethChapterIndex /></DialogFrame> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

async function readAnalysisResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json() as Promise<Record<string, unknown>>;
  const text = await response.text();
  const events = text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    try { return JSON.parse(line) as Record<string, unknown>; } catch { return undefined; }
  }).filter((event): event is Record<string, unknown> => Boolean(event));
  const result = [...events].reverse().find((event) => event.type === "result" || event.candidateNodes);
  if (!result) throw new Error("本机分析服务没有返回可读取的结果。");
  return (result.data && typeof result.data === "object" ? result.data : result) as Record<string, unknown>;
}

async function hashText(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const ANALYSIS_BATCH_TARGET_BYTES = 780 * 1024;
const ANALYSIS_MESSAGE_MAX_CHARS = 115_000;

async function createAnalysisBatches(conversations: ImportedConversation[]) {
  const chunks: ImportedConversation[] = [];
  for (const conversation of conversations) {
    let messages: ImportedConversation["messages"] = [];
    let part = 1;
    const flush = () => {
      if (!messages.length) return;
      chunks.push({
        id: part === 1 ? conversation.id : `${conversation.id}-part-${part}`,
        title: part === 1 ? conversation.title : `${conversation.title} · 分片 ${part}`,
        messages,
      });
      part += 1;
      messages = [];
    };
    for (const message of conversation.messages) {
      const safeMessage = {
        ...message,
        content: message.content.slice(0, ANALYSIS_MESSAGE_MAX_CHARS),
      };
      const candidate = [...messages, safeMessage];
      const candidateBytes = new TextEncoder().encode(JSON.stringify({
        conversations: [{ ...conversation, messages: candidate }],
      })).byteLength;
      if (candidateBytes > ANALYSIS_BATCH_TARGET_BYTES && messages.length) flush();
      messages.push(safeMessage);
    }
    flush();
  }

  const batches: ImportedConversation[][] = [];
  let current: ImportedConversation[] = [];
  for (const chunk of chunks) {
    const candidate = [...current, chunk];
    const bytes = new TextEncoder().encode(JSON.stringify({ conversations: candidate })).byteLength;
    const messageCount = candidate.reduce((sum, item) => sum + item.messages.length, 0);
    if ((bytes > ANALYSIS_BATCH_TARGET_BYTES || candidate.length > 40 || messageCount > 1_800) && current.length) {
      batches.push(current);
      current = [];
    }
    current.push(chunk);
  }
  if (current.length) batches.push(current);

  return Promise.all(batches.map(async (batch) => {
    const serialized = JSON.stringify({ conversations: batch });
    return { conversations: batch, hash: await hashText(serialized) };
  }));
}

async function normalizeAiResult(raw: Record<string, unknown>, current: BeliefMap, batchIndex: number) {
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((item): item is string => typeof item === "string") : [];
  const rawExcerpts = Array.isArray(raw.sourceExcerpts) ? raw.sourceExcerpts : [];
  const excerpts: SourceExcerpt[] = [];
  for (let index = 0; index < rawExcerpts.length; index += 1) {
    const candidate = rawExcerpts[index] as Record<string, unknown>;
    const text = String(candidate.text ?? "").trim();
    if (!text) continue;
    const withDefaults = {
      ...candidate,
      id: String(candidate.id ?? `ai-source-${batchIndex}-${index}`),
      role: candidate.role ?? "unknown",
      provenance: candidate.provenance ?? "A",
      confidence: candidate.confidence ?? "medium",
      sensitive: Boolean(candidate.sensitive),
      text,
      contentHash: candidate.contentHash ?? await hashText(text),
      createdAt: candidate.createdAt ?? null,
    };
    const parsed = SourceExcerptSchema.safeParse(withDefaults);
    if (parsed.success) excerpts.push(parsed.data); else warnings.push(`已忽略 1 条不合规证据：${parsed.error.issues[0]?.message ?? "未知原因"}`);
  }
  const excerptIds = new Set([...current.sourceExcerpts.map((item) => item.id), ...excerpts.map((item) => item.id)]);
  const now = new Date().toISOString();
  const rawNodes = Array.isArray(raw.candidateNodes) ? raw.candidateNodes : [];
  const nodes: BeliefNode[] = rawNodes.flatMap((item, index) => {
    const candidate = item as Record<string, unknown>;
    const description = String(candidate.description ?? candidate.text ?? candidate.label ?? "").trim();
    const sourceExcerptIds = Array.isArray(candidate.sourceExcerptIds) ? candidate.sourceExcerptIds.filter((id): id is string => typeof id === "string" && excerptIds.has(id)) : [];
    const parsed = BeliefNodeSchema.safeParse({
      ...candidate,
      id: String(candidate.id ?? `ai-node-${batchIndex}-${index}`),
      kind: candidate.kind ?? "rule",
      label: String(candidate.label ?? (description.slice(0, 40) || "待核对信念")),
      description: description || "需要回到原对话核对。",
      depth: candidate.depth ?? 2,
      primaryDomain: candidate.primaryDomain ?? "self",
      domains: candidate.domains ?? [candidate.primaryDomain ?? "self"],
      temporalLayer: candidate.temporalLayer ?? "current",
      confidence: candidate.confidence ?? "medium",
      sensitive: Boolean(candidate.sensitive),
      provenance: candidate.provenance ?? ["I"],
      sourceExcerptIds,
      status: candidate.status ?? ((candidate.provenance as string[] | undefined)?.includes("G") ? "emerging" : "under-review"),
      tags: candidate.tags ?? ["AI分析"],
      impact: candidate.impact ?? 3,
      strength: candidate.strength ?? 3,
      createdAt: now,
      updatedAt: now,
    });
    if (!parsed.success) { warnings.push(`已忽略 1 个不合规节点：${parsed.error.issues[0]?.message ?? "未知原因"}`); return []; }
    return [parsed.data];
  });
  const nodeIds = new Set([...current.nodes.map((node) => node.id), ...nodes.map((node) => node.id)]);
  const rawEdges = Array.isArray(raw.candidateEdges) ? raw.candidateEdges : [];
  const edges: BeliefEdge[] = rawEdges.flatMap((item, index) => {
    const candidate = item as Record<string, unknown>;
    const source = String(candidate.source ?? "");
    const target = String(candidate.target ?? "");
    if (!nodeIds.has(source) || !nodeIds.has(target)) { warnings.push("已忽略指向不存在节点的关系。"); return []; }
    const parsed = BeliefEdgeSchema.safeParse({
      ...candidate,
      id: String(candidate.id ?? `ai-edge-${batchIndex}-${index}`),
      source,
      target,
      kind: candidate.kind ?? "shapes",
      label: String(candidate.label ?? candidate.kind ?? "影响"),
      bidirectional: Boolean(candidate.bidirectional),
      confidence: candidate.confidence ?? "medium",
      sensitive: Boolean(candidate.sensitive),
      provenance: candidate.provenance ?? ["I"],
      sourceExcerptIds: Array.isArray(candidate.sourceExcerptIds) ? candidate.sourceExcerptIds.filter((id): id is string => typeof id === "string" && excerptIds.has(id)) : [],
    });
    if (!parsed.success) { warnings.push(`已忽略 1 条不合规关系：${parsed.error.issues[0]?.message ?? "未知原因"}`); return []; }
    return [parsed.data];
  });
  return { nodes, edges, excerpts, warnings };
}
