"use client";

import Dexie, { type Table } from "dexie";
import { create } from "zustand";

import type {
  BeliefEdge,
  BeliefMap,
  BeliefNode,
  CheckIn,
  Domain,
  EdgeKind,
  NodeKind,
  SourceExcerpt,
} from "../lib/belief-types";
import { EDGE_STYLE, KIND_DEFAULT_DEPTH } from "../lib/belief-theme";
import { layoutBeliefMap } from "../lib/layout";
import { initialBeliefMap } from "../lib/seed";
import { applySystemRevision, REVIEW_MARKER } from "../lib/system-revision";

type ViewMode = "system" | "3d" | "2d";
type FocusMode = "all" | "neighbors";

type SavedBeliefMap = {
  id: string;
  map: BeliefMap;
  savedAt: string;
};

type LocalSetting = {
  key: string;
  value: unknown;
};

class BeliefDatabase extends Dexie {
  maps!: Table<SavedBeliefMap, string>;
  settings!: Table<LocalSetting, string>;

  constructor() {
    super("belief-universe-local-v1");
    this.version(1).stores({ maps: "id,savedAt" });
    this.version(2).stores({ maps: "id,savedAt", settings: "key" });
  }
}

let database: BeliefDatabase | undefined;

function getDatabase() {
  if (typeof indexedDB === "undefined") return undefined;
  database ??= new BeliefDatabase();
  return database;
}

function nowIso() {
  return new Date().toISOString();
}

function stableId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "") ??
    Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now().toString(36)}-${random.slice(0, 12)}`;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function snapshot(map: BeliefMap): BeliefMap {
  return structuredClone(map);
}

async function persist(map: BeliefMap) {
  const db = getDatabase();
  if (!db) return;
  await db.maps.put({ id: "active", map: snapshot(map), savedAt: nowIso() });
}

export type NewBeliefChain = {
  belief: string;
  domain: Domain;
  trigger?: string;
  behavior?: string;
  outcome?: string;
  impact: number;
  strength: number;
  sensitive: boolean;
};

export type NewLinkedBelief = {
  fromId: string;
  label: string;
  kind: NodeKind;
  relation: EdgeKind;
  /** false: existing → new; true: new → existing. */
  reverse: boolean;
};

type BeliefStore = {
  map: BeliefMap;
  hydrated: boolean;
  storageError?: string;
  selectedId?: string;
  query: string;
  domains: Domain[];
  viewMode: ViewMode;
  focusMode: FocusMode;
  showBridges: boolean;
  reducedMotion: boolean;
  lastBackupAt?: string;
  analyzedBatchHashes: string[];
  undoStack: BeliefMap[];
  hydrate: () => Promise<void>;
  select: (id?: string) => void;
  setQuery: (query: string) => void;
  toggleDomain: (domain: Domain) => void;
  clearDomains: () => void;
  setViewMode: (mode: ViewMode) => void;
  setFocusMode: (mode: FocusMode) => void;
  toggleBridges: () => void;
  setReducedMotion: (value: boolean) => void;
  updateNode: (id: string, patch: Partial<BeliefNode>) => void;
  archiveNode: (id: string) => void;
  addEdge: (source: string, target: string, kind: EdgeKind, label: string) => void;
  removeEdge: (id: string) => void;
  addCheckIn: (nodeId: string, strength: number, activation: number, note?: string) => void;
  addBeliefChain: (input: NewBeliefChain) => Promise<string>;
  addLinkedBelief: (input: NewLinkedBelief) => Promise<string | undefined>;
  replaceMap: (map: BeliefMap) => void;
  mergeGraph: (
    nodes: BeliefNode[],
    edges: BeliefEdge[],
    excerpts: SourceExcerpt[],
  ) => void;
  mergeEvidenceMap: (sourceMap: BeliefMap) => void;
  markBatchAnalyzed: (hash: string) => Promise<void>;
  undo: () => void;
  markBackup: () => void;
};

function persistOrReport(
  map: BeliefMap,
  set: (patch: Partial<BeliefStore>) => void,
) {
  void persist(map).catch((error: unknown) => {
    set({
      storageError:
        error instanceof Error ? error.message : "本机存储失败，请立即导出备份。",
    });
  });
}

export const useBeliefStore = create<BeliefStore>((set, get) => {
  const commit = (producer: (current: BeliefMap) => BeliefMap) => {
    const previous = get().map;
    const next = layoutBeliefMap({
      ...producer(snapshot(previous)),
      updatedAt: nowIso(),
    });
    set((state) => ({
      map: next,
      undoStack: [...state.undoStack.slice(-7), snapshot(previous)],
      storageError: undefined,
    }));
    persistOrReport(next, set);
  };

  return {
    map: layoutBeliefMap(initialBeliefMap),
    hydrated: false,
    query: "",
    domains: [],
    viewMode: "system",
    focusMode: "all",
    showBridges: false,
    reducedMotion: false,
    analyzedBatchHashes: [],
    undoStack: [],

    hydrate: async () => {
      try {
        const db = getDatabase();
        const [saved, analysisCache, backupSetting] = await Promise.all([
          db?.maps.get("active"),
          db?.settings.get("analyzed-batch-hashes"),
          db?.settings.get("last-backup-at"),
        ]);
        const previous = saved?.map ?? initialBeliefMap;
        // A failed migration must leave the user's loaded graph, not the starter map.
        set({ map: layoutBeliefMap(previous) });
        const updated = await applySystemRevision(previous);
        if (updated !== previous && db) {
          // Keep the original saved graph before the one-time evidence revision.
          await db.transaction("rw", db.maps, async () => {
            if (saved && !(await db.maps.get(`before-${REVIEW_MARKER}`))) {
              await db.maps.put({ ...saved, id: `before-${REVIEW_MARKER}` });
            }
            await db.maps.put({ id: "active", map: snapshot(updated), savedAt: nowIso() });
          });
        }
        set({
          map: layoutBeliefMap(updated),
          hydrated: true,
          storageError: undefined,
          analyzedBatchHashes: Array.isArray(analysisCache?.value)
            ? analysisCache.value.filter((value): value is string => typeof value === "string")
            : [],
          lastBackupAt:
            typeof backupSetting?.value === "string"
              ? backupSetting.value
              : undefined,
        });
      } catch (error) {
        set({
          hydrated: true,
          storageError:
            error instanceof Error ? error.message : "无法读取本机信念库。",
        });
      }
    },
    select: (selectedId) => set({ selectedId }),
    setQuery: (query) => set({ query }),
    toggleDomain: (domain) =>
      set((state) => ({
        domains: state.domains.includes(domain)
          ? state.domains.filter((item) => item !== domain)
          : [...state.domains, domain],
      })),
    clearDomains: () => set({ domains: [] }),
    setViewMode: (viewMode) => set({ viewMode }),
    setFocusMode: (focusMode) => set({ focusMode }),
    toggleBridges: () => set((state) => ({ showBridges: !state.showBridges })),
    setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    updateNode: (id, patch) =>
      commit((map) => ({
        ...map,
        nodes: map.nodes.map((node) =>
          node.id === id ? { ...node, ...patch, id: node.id, updatedAt: nowIso() } : node,
        ),
      })),
    archiveNode: (id) =>
      commit((map) => ({
        ...map,
        nodes: map.nodes.map((node) =>
          node.id === id ? { ...node, status: "archived", updatedAt: nowIso() } : node,
        ),
      })),
    addEdge: (source, target, kind, label) =>
      commit((map) => ({
        ...map,
        edges: [
          ...map.edges,
          {
            id: stableId("edge"),
            source,
            target,
            kind,
            label: label || kind,
            bidirectional: kind === "conflicts-with",
            confidence: "high",
            sensitive: false,
            provenance: ["U0"],
            sourceExcerptIds: [],
          },
        ],
      })),
    removeEdge: (id) =>
      commit((map) => ({
        ...map,
        edges: map.edges.filter((edge) => edge.id !== id),
      })),
    addCheckIn: (nodeId, strength, activation, note) => {
      const checkIn: CheckIn = {
        id: stableId("checkin"),
        nodeId,
        at: nowIso(),
        strength,
        activation,
        note: note?.trim() || undefined,
        sourceExcerptIds: [],
      };
      commit((map) => ({ ...map, checkIns: [...map.checkIns, checkIn] }));
    },
    addBeliefChain: async (input) => {
      const createdAt = nowIso();
      const beliefId = stableId("belief");
      const excerptId = stableId("source-user");
      const evidenceText = [
        `信念：${input.belief}`,
        input.trigger ? `触发：${input.trigger}` : "",
        input.behavior ? `行为：${input.behavior}` : "",
        input.outcome ? `结果：${input.outcome}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const excerpt: SourceExcerpt = {
        id: excerptId,
        role: "user",
        provenance: "U0",
        confidence: "high",
        sensitive: input.sensitive,
        text: evidenceText,
        contentHash: await sha256(evidenceText),
        createdAt,
      };
      const nodeBase = {
        depth: 3,
        primaryDomain: input.domain,
        domains: [input.domain],
        temporalLayer: "current" as const,
        confidence: "high" as const,
        sensitive: input.sensitive,
        provenance: ["U0" as const],
        sourceExcerptIds: [excerptId],
        status: "active" as const,
        tags: ["手动记录"],
        impact: input.impact,
        strength: input.strength,
        createdAt,
        updatedAt: createdAt,
      };
      const newNodes: BeliefNode[] = [
        {
          ...nodeBase,
          id: beliefId,
          kind: "rule",
          label: input.belief.slice(0, 40),
          description: input.belief,
          depth: 2,
        },
      ];
      const newEdges: BeliefEdge[] = [];
      const addPeripheral = (
        kind: BeliefNode["kind"],
        text: string | undefined,
        relation: BeliefEdge["kind"],
        prefix: string,
      ) => {
        if (!text?.trim()) return;
        const id = stableId(prefix);
        newNodes.push({
          ...nodeBase,
          id,
          kind,
          label: text.trim().slice(0, 40),
          description: text.trim(),
          depth: 4,
          impact: Math.max(1, input.impact - 1),
        });
        newEdges.push({
          id: stableId("edge"),
          source: kind === "trigger" ? id : beliefId,
          target: kind === "trigger" ? beliefId : id,
          kind: relation,
          label: relation,
          bidirectional: false,
          confidence: "high",
          sensitive: input.sensitive,
          provenance: ["U0"],
          sourceExcerptIds: [excerptId],
        });
      };
      addPeripheral("trigger", input.trigger, "activates", "trigger");
      addPeripheral("behavior", input.behavior, "drives", "behavior");
      addPeripheral("outcome", input.outcome, "leads-to", "outcome");

      commit((map) => ({
        ...map,
        nodes: [...map.nodes, ...newNodes],
        edges: [...map.edges, ...newEdges],
        sourceExcerpts: [...map.sourceExcerpts, excerpt],
      }));
      set({ selectedId: beliefId });
      return beliefId;
    },
    addLinkedBelief: async (input) => {
      const from = get().map.nodes.find((node) => node.id === input.fromId);
      const text = input.label.trim();
      if (!from || !text) return undefined;
      const createdAt = nowIso();
      const nodeId = stableId("belief");
      const excerptId = stableId("source-user");
      const evidenceText = `信念：${text}`;
      // A new neighbour inherits the sensitivity of the node it grows from.
      const excerpt: SourceExcerpt = {
        id: excerptId,
        role: "user",
        provenance: "U0",
        confidence: "high",
        sensitive: from.sensitive,
        text: evidenceText,
        contentHash: await sha256(evidenceText),
        createdAt,
      };
      const node: BeliefNode = {
        id: nodeId,
        kind: input.kind,
        label: text.slice(0, 40),
        description: text,
        depth: KIND_DEFAULT_DEPTH[input.kind],
        primaryDomain: from.primaryDomain,
        domains: [from.primaryDomain],
        temporalLayer: from.temporalLayer,
        impact: 3,
        strength: 3,
        confidence: "high",
        sensitive: from.sensitive,
        provenance: ["U0"],
        sourceExcerptIds: [excerptId],
        status: "active",
        tags: ["手动记录"],
        createdAt,
        updatedAt: createdAt,
      };
      const edge: BeliefEdge = {
        id: stableId("edge"),
        source: input.reverse ? nodeId : from.id,
        target: input.reverse ? from.id : nodeId,
        kind: input.relation,
        label: EDGE_STYLE[input.relation].label,
        bidirectional: input.relation === "conflicts-with",
        confidence: "high",
        sensitive: from.sensitive,
        provenance: ["U0"],
        sourceExcerptIds: [excerptId],
      };
      commit((map) => ({
        ...map,
        nodes: [...map.nodes, node],
        edges: [...map.edges, edge],
        sourceExcerpts: [...map.sourceExcerpts, excerpt],
      }));
      set({ selectedId: nodeId });
      return nodeId;
    },
    replaceMap: (map) => commit(() => snapshot(map)),
    mergeGraph: (nodes, edges, excerpts) =>
      commit((map) => {
        const nodeIds = new Set(map.nodes.map((node) => node.id));
        const excerptIds = new Set(map.sourceExcerpts.map((item) => item.id));
        const nextNodes = nodes.filter((node) => !nodeIds.has(node.id));
        nextNodes.forEach((node) => nodeIds.add(node.id));
        return {
          ...map,
          nodes: [...map.nodes, ...nextNodes],
          edges: [
            ...map.edges,
            ...edges.filter(
              (edge) =>
                nodeIds.has(edge.source) &&
                nodeIds.has(edge.target) &&
                !map.edges.some((current) => current.id === edge.id),
            ),
          ],
          sourceExcerpts: [
            ...map.sourceExcerpts,
            ...excerpts.filter((excerpt) => !excerptIds.has(excerpt.id)),
          ],
        };
      }),
    mergeEvidenceMap: (sourceMap) =>
      commit((map) => {
        const excerptIds = new Set(map.sourceExcerpts.map((item) => item.id));
        return {
          ...map,
          sourceExcerpts: [
            ...map.sourceExcerpts,
            ...sourceMap.sourceExcerpts.filter((excerpt) => !excerptIds.has(excerpt.id)),
          ],
          coverage: sourceMap.coverage ?? map.coverage,
        };
      }),
    markBatchAnalyzed: async (hash) => {
      const next = Array.from(new Set([...get().analyzedBatchHashes, hash])).slice(-5_000);
      set({ analyzedBatchHashes: next });
      await getDatabase()?.settings.put({ key: "analyzed-batch-hashes", value: next });
    },
    undo: () => {
      const previous = get().undoStack.at(-1);
      if (!previous) return;
      set((state) => ({ map: previous, undoStack: state.undoStack.slice(0, -1) }));
      persistOrReport(previous, set);
    },
    markBackup: () => {
      const lastBackupAt = nowIso();
      set({ lastBackupAt });
      const db = getDatabase();
      if (db) {
        void db.settings
          .put({ key: "last-backup-at", value: lastBackupAt })
          .catch((error: unknown) => {
            set({
              storageError:
                error instanceof Error
                  ? error.message
                  : "无法记录最近备份时间。",
            });
          });
      }
    },
  };
});
