import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { initialBeliefMap } from "../app/lib/seed";
import { BeliefMapSchema } from "../app/lib/belief-types";
import { applySystemRevision, REVIEW_MARKER, reviewCoverage } from "../app/lib/system-revision";

describe("evidence architecture revision", () => {
  it("keeps quotations distinct and grounds attention, feelings and context in sources", async () => {
    const map = await applySystemRevision(initialBeliefMap);
    expect(BeliefMapSchema.safeParse(map).success).toBe(true);
    expect(map.sourceExcerpts.find((item) => item.id === "history-e19")).toMatchObject({ role: "assistant", provenance: "Q" });
    expect(reviewCoverage(map)).toEqual({ conversations: 9, direct: 28, quoted: 2 });
    expect(map.nodes.filter((item) => item.tags.includes("意识心焦点"))).toHaveLength(4);
    expect(map.nodes.filter((item) => item.tags.includes("感受线索"))).toHaveLength(4);
    expect(map.nodes.find((item) => item.id === "rule-vigilance-reliable")?.status).toBe("archived");
    expect(map.nodes.find((item) => item.id === "rev-rule-money-morality")?.confidence).toBe("low");
    expect(map.edges.filter((item) => item.id.startsWith("rev-")).every((item) => item.provenance.includes("I"))).toBe(true);
  });

  it("is idempotent and does not mutate the input", async () => {
    const before = structuredClone(initialBeliefMap);
    const map = await applySystemRevision(initialBeliefMap);
    expect(initialBeliefMap).toEqual(before);
    expect(await applySystemRevision(map)).toBe(map);
    expect(map.sourceExcerpts.filter((item) => item.id === REVIEW_MARKER)).toHaveLength(1);
  });

  it("preserves user edits, archives, custom graph records and imported coverage", async () => {
    const edited = structuredClone(initialBeliefMap);
    const target = edited.nodes.find((item) => item.id === "core-limiting-completeness")!;
    target.description = "用户自己的解释";
    target.status = "archived";
    edited.edges[0].label = "用户自己的关系";
    edited.title = "我的独立图谱";
    const originalCoverage = structuredClone(edited.coverage);
    const revised = await applySystemRevision(edited);
    expect(revised.nodes.find((item) => item.id === target.id)).toEqual(target);
    expect(revised.edges[0].label).toBe("用户自己的关系");
    expect(revised.title).toBe("我的独立图谱");
    expect(revised.coverage).toEqual(originalCoverage);
  });

  it("keeps the loaded user graph and stored active record when migration writes fail", async () => {
    const indexedDB = new IDBFactory();
    const dependencies = { ...Dexie.dependencies };
    Dexie.dependencies.indexedDB = indexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
    vi.stubGlobal("indexedDB", indexedDB);

    const db = new Dexie("belief-universe-local-v1", { indexedDB, IDBKeyRange });
    db.version(1).stores({ maps: "id,savedAt" });
    db.version(2).stores({ maps: "id,savedAt", settings: "key" });
    const savedMap = structuredClone(initialBeliefMap);
    savedMap.title = "用户已保存的独立图谱";
    savedMap.nodes[0].description = "不能被种子或迁移失败覆盖的用户修改";
    const saved = { id: "active", map: savedMap, savedAt: "2026-09-27T12:00:00.000Z" };
    const storeDatabases = new Set<Dexie>();

    try {
      await db.table("maps").put(saved);
      const transaction = vi.spyOn(Dexie.prototype, "transaction").mockImplementation(function (this: Dexie) {
        storeDatabases.add(this);
        return Dexie.Promise.reject(new Error("Migration write rejected"));
      });
      const { useBeliefStore } = await import("../app/store/belief-store");
      await useBeliefStore.getState().hydrate();

      const state = useBeliefStore.getState();
      expect(transaction).toHaveBeenCalledOnce();
      expect(state.hydrated).toBe(true);
      expect(state.storageError).toBe("Migration write rejected");
      expect(state.map.title).toBe(savedMap.title);
      expect(state.map.nodes[0].description).toBe(savedMap.nodes[0].description);
      expect(state.map.sourceExcerpts.some((item) => item.id === REVIEW_MARKER)).toBe(false);
      expect(await db.table("maps").get("active")).toEqual(saved);
      expect(await db.table("maps").get(`before-${REVIEW_MARKER}`)).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
      storeDatabases.forEach((database) => database.close());
      db.close();
      Dexie.dependencies.indexedDB = dependencies.indexedDB;
      Dexie.dependencies.IDBKeyRange = dependencies.IDBKeyRange;
      vi.unstubAllGlobals();
    }
  });
});
