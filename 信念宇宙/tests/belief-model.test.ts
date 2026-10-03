import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { BeliefMapSchema, type BeliefMap } from "../app/lib/belief-types";
import {
  parseChatGPTFile,
  parseChatGPTPayload,
} from "../app/lib/importers";
import { layoutBeliefMap } from "../app/lib/layout";
import {
  BeliefMapImportError,
  deserializeBeliefMap,
  migrateBeliefMap,
  serializeBeliefMap,
} from "../app/lib/serialization";
import { initialBeliefMap } from "../app/lib/seed";

describe("BeliefMap v1 seed", () => {
  it("contains the required node groups, evidence registers, and conflicts", () => {
    const parsed = BeliefMapSchema.parse(initialBeliefMap);
    const counts = Object.fromEntries(
      [
        "value",
        "resource-core",
        "limiting-core",
        "rule",
        "strategy",
        "bridge-belief",
      ].map((kind) => [
        kind,
        parsed.nodes.filter((node) => node.kind === kind).length,
      ]),
    );

    expect(counts).toEqual({
      value: 4,
      "resource-core": 2,
      "limiting-core": 3,
      rule: 7,
      strategy: 6,
      "bridge-belief": 5,
    });
    expect(parsed.nodes).toHaveLength(27);
    expect(
      parsed.edges.filter((edge) => edge.kind === "conflicts-with"),
    ).toHaveLength(6);

    expect(new Set(parsed.sourceExcerpts.map((source) => source.provenance))).toEqual(
      new Set(["U0", "Q", "A", "I", "G"]),
    );
    expect(new Set(parsed.nodes.map((node) => node.confidence))).toEqual(
      new Set(["high", "medium", "low"]),
    );
    expect(parsed.nodes.some((node) => node.sensitive)).toBe(true);
    expect(
      parsed.nodes
        .filter((node) => node.kind === "bridge-belief")
        .every(
          (node) =>
            node.status === "candidate" &&
            node.temporalLayer === "emerging" &&
            node.provenance.length === 1 &&
            node.provenance[0] === "G" &&
            node.confidence === "low",
        ),
    ).toBe(true);
  });

  it("does not contain isolated seed nodes", () => {
    const linkedIds = new Set(
      initialBeliefMap.edges.flatMap((edge) => [edge.source, edge.target]),
    );
    expect(
      initialBeliefMap.nodes.filter((node) => !linkedIds.has(node.id)),
    ).toEqual([]);
  });
});

describe("deterministic semantic layout", () => {
  it("is stable, non-mutating, and maps depth/time to radius/height", () => {
    const before = structuredClone(initialBeliefMap);
    const first = layoutBeliefMap(initialBeliefMap);
    const second = layoutBeliefMap(initialBeliefMap);

    expect(first.nodes.map((node) => node.position)).toEqual(
      second.nodes.map((node) => node.position),
    );
    expect(initialBeliefMap).toEqual(before);

    const averageRadiusByDepth = new Map<number, number>();
    for (const depth of [0, 1, 2, 3]) {
      const atDepth = first.nodes.filter((node) => node.depth === depth);
      averageRadiusByDepth.set(
        depth,
        atDepth.reduce(
          (sum, node) =>
            sum + Math.hypot(node.position!.x, node.position!.z),
          0,
        ) / atDepth.length,
      );
    }
    expect(averageRadiusByDepth.get(0)!).toBeLessThan(
      averageRadiusByDepth.get(1)!,
    );
    expect(averageRadiusByDepth.get(1)!).toBeLessThan(
      averageRadiusByDepth.get(2)!,
    );
    expect(averageRadiusByDepth.get(2)!).toBeLessThan(
      averageRadiusByDepth.get(3)!,
    );

    const currentY = first.nodes
      .filter((node) => node.temporalLayer === "current")
      .map((node) => node.position!.y);
    const emergingY = first.nodes
      .filter((node) => node.temporalLayer === "emerging")
      .map((node) => node.position!.y);
    expect(Math.max(...currentY)).toBeLessThan(Math.min(...emergingY));
  });
});

describe("graph validation and serialization", () => {
  it("rejects orphan edges", () => {
    const broken = structuredClone(initialBeliefMap) as BeliefMap;
    broken.edges.push({
      ...broken.edges[0],
      id: "edge-orphan-test",
      target: "missing-node",
    });

    const result = BeliefMapSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("missing-node"))).toBe(
        true,
      );
    }
  });

  it("round-trips v1 and deterministically migrates v0 field names", () => {
    expect(deserializeBeliefMap(serializeBeliefMap(initialBeliefMap))).toEqual(
      initialBeliefMap,
    );

    const legacy: Record<string, unknown> = structuredClone(initialBeliefMap);
    legacy.schemaVersion = 0;
    legacy.relationships = legacy.edges;
    legacy.evidence = legacy.sourceExcerpts;
    delete legacy.edges;
    delete legacy.sourceExcerpts;

    expect(migrateBeliefMap(legacy)).toEqual(initialBeliefMap);
  });

  it("rejects malformed JSON and structurally damaged imports", () => {
    expect(() => deserializeBeliefMap("{broken")).toThrow(BeliefMapImportError);

    const broken = structuredClone(initialBeliefMap) as BeliefMap;
    broken.nodes[0].impact = 99;
    expect(() => deserializeBeliefMap(JSON.stringify(broken))).toThrow(
      BeliefMapImportError,
    );
  });
});

describe("ChatGPT client-side import", () => {
  it("validates conversations.json, hashes content, and deduplicates messages", async () => {
    const payload = [
      {
        id: "conversation-a",
        title: "A",
        mapping: {
          one: {
            id: "one",
            message: {
              id: "message-one",
              author: { role: "user" },
              create_time: 1_700_000_000,
              content: { content_type: "text", parts: ["相同内容"] },
            },
          },
          two: {
            id: "two",
            message: {
              id: "message-two",
              author: { role: "assistant" },
              create_time: 1_700_000_001,
              content: { content_type: "text", parts: ["另一条内容"] },
            },
          },
        },
      },
      {
        id: "conversation-b",
        title: "B",
        mapping: {
          three: {
            id: "three",
            message: {
              id: "message-three",
              author: { role: "user" },
              create_time: 1_700_000_002,
              content: { content_type: "text", parts: ["相同内容"] },
            },
          },
          four: {
            id: "four",
            message: {
              id: "message-four",
              author: { role: "user" },
              create_time: 1_700_000_003,
              content: { content_type: "text", parts: [] },
            },
          },
        },
      },
    ];

    const result = await parseChatGPTPayload(payload);
    expect(result.map).toBeDefined();
    expect(result.coverage).toMatchObject({
      filesSeen: 1,
      filesAccepted: 1,
      conversationCount: 2,
      messageCount: 4,
      uniqueMessageCount: 2,
      duplicateMessageCount: 1,
      emptyMessageCount: 1,
      userMessageCount: 3,
      assistantMessageCount: 1,
    });
    expect(result.coverage.contentHashes).toHaveLength(2);
    expect(new Set(result.coverage.contentHashes).size).toBe(2);
    expect(result.map!.sourceExcerpts).toHaveLength(2);
    expect(result.map!.nodes).toEqual([]);
    expect(result.map!.edges).toEqual([]);
    expect(result.conversations).toHaveLength(2);
    expect(
      result.conversations.flatMap((conversation) => conversation.messages),
    ).toHaveLength(2);
    expect(result.conversations[0].messages[0]).toMatchObject({
      id: "message-one",
      role: "user",
      content: "相同内容",
    });
  });

  it("returns coverage warnings instead of accepting a malformed export", async () => {
    const result = await parseChatGPTPayload([{ id: "missing-mapping" }]);
    expect(result.map).toBeUndefined();
    expect(result.coverage.filesAccepted).toBe(0);
    expect(result.warnings.join(" ")).toContain("conversations.json");
  });

  it("parses TXT into the same conversation wire shape", async () => {
    const file = new File(
      ["用户：我相信学习会改变选择。\n\n助手：这仍需要由你确认。"],
      "belief-notes.txt",
      { type: "text/plain" },
    );
    const result = await parseChatGPTFile(file);
    expect(result.map?.sourceExcerpts).toHaveLength(2);
    expect(result.conversations[0].messages).toEqual([
      expect.objectContaining({
        id: "txt-message-1",
        role: "user",
        content: "我相信学习会改变选择。",
      }),
      expect.objectContaining({
        id: "txt-message-2",
        role: "assistant",
        content: "这仍需要由你确认。",
      }),
    ]);
  });

  it("finds and validates conversations.json inside a ChatGPT ZIP", async () => {
    const zip = new JSZip();
    zip.file(
      "export/conversations.json",
      JSON.stringify([
        {
          id: "zip-conversation",
          title: "ZIP conversation",
          mapping: {
            root: {
              id: "root",
              message: {
                id: "zip-message",
                author: { role: "user" },
                create_time: 1_700_000_000,
                content: { content_type: "text", parts: ["来自 ZIP"] },
              },
            },
          },
        },
      ]),
    );
    zip.file("export/attachments/image.png", new Uint8Array([137, 80, 78, 71]));
    const archive = await zip.generateAsync({ type: "uint8array" });
    const file = new File([archive.buffer as ArrayBuffer], "chatgpt-export.zip", {
      type: "application/zip",
    });

    const result = await parseChatGPTFile(file);
    expect(result.coverage.sourceType).toBe("chatgpt-zip");
    expect(result.coverage.filesSeen).toBe(2);
    expect(result.coverage.filesAccepted).toBe(1);
    expect(result.coverage.warnings.join(" ")).toContain("没有读取");
    expect(result.map?.sourceExcerpts[0].text).toBe("来自 ZIP");
    expect(result.conversations[0].messages[0].content).toBe("来自 ZIP");
  });
});
