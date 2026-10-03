import { describe, expect, it } from "vitest";
import { BeliefMapSchema } from "../app/lib/belief-types";
import { useBeliefStore } from "../app/store/belief-store";

describe("quick edits from the 3D universe", () => {
  it("grows a linked belief that inherits place and sensitivity, and undo removes it", async () => {
    const store = useBeliefStore.getState();
    const from = store.map.nodes.find((node) => node.sensitive && node.status !== "archived")!;
    const before = store.map;

    const id = await store.addLinkedBelief({
      fromId: from.id,
      label: "  慢一点也能做好 ",
      kind: "strategy",
      relation: "drives",
      reverse: true,
    });

    const { map, selectedId } = useBeliefStore.getState();
    expect(BeliefMapSchema.safeParse(map).success).toBe(true);
    const node = map.nodes.find((item) => item.id === id)!;
    expect(node).toMatchObject({
      label: "慢一点也能做好",
      kind: "strategy",
      depth: 3,
      primaryDomain: from.primaryDomain,
      temporalLayer: from.temporalLayer,
      sensitive: true,
      provenance: ["U0"],
    });
    expect(node.position).toBeDefined();
    expect(map.edges.find((item) => item.source === id && item.target === from.id)?.kind).toBe("drives");
    expect(map.sourceExcerpts.find((item) => item.id === node.sourceExcerptIds[0])).toMatchObject({
      role: "user",
      provenance: "U0",
      sensitive: true,
      text: "信念：慢一点也能做好",
    });
    expect(selectedId).toBe(id);

    useBeliefStore.getState().undo();
    expect(useBeliefStore.getState().map).toEqual(before);
  });

  it("ignores blank text and unknown source nodes", async () => {
    const store = useBeliefStore.getState();
    const before = store.map;
    const anyNode = before.nodes[0];
    expect(await store.addLinkedBelief({ fromId: anyNode.id, label: "   ", kind: "rule", relation: "supports", reverse: false })).toBeUndefined();
    expect(await store.addLinkedBelief({ fromId: "missing-node", label: "x", kind: "rule", relation: "supports", reverse: false })).toBeUndefined();
    expect(useBeliefStore.getState().map).toBe(before);
  });

  it("removes exactly one relation", () => {
    const { map, removeEdge } = useBeliefStore.getState();
    const edge = map.edges[0];
    removeEdge(edge.id);
    const next = useBeliefStore.getState().map;
    expect(next.edges).toHaveLength(map.edges.length - 1);
    expect(next.edges.some((item) => item.id === edge.id)).toBe(false);
  });

  it("moves a node inward and upward when its ring and time layer change", () => {
    const { map, updateNode } = useBeliefStore.getState();
    const node = map.nodes.find((item) => item.depth === 2 && item.temporalLayer === "current")!;
    updateNode(node.id, { depth: 0, temporalLayer: "emerging" });
    const moved = useBeliefStore.getState().map.nodes.find((item) => item.id === node.id)!;
    expect(Math.hypot(moved.position!.x, moved.position!.z)).toBeLessThan(Math.hypot(node.position!.x, node.position!.z));
    expect(moved.position!.y).toBeGreaterThan(node.position!.y);
  });
});
