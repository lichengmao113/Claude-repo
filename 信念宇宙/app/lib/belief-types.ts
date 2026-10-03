import { z } from "zod";

const IdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, "must be a stable identifier");

const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "must be a lowercase SHA-256 digest");

export const NodeKindSchema = z.enum([
  "value",
  "resource-core",
  "limiting-core",
  "rule",
  "strategy",
  "bridge-belief",
  "source-event",
  "trigger",
  "emotion-body",
  "behavior",
  "outcome",
  "evidence",
  "experiment-practice",
]);

export type NodeKind = z.infer<typeof NodeKindSchema>;

export const DomainSchema = z.enum([
  "self",
  "relationship",
  "life",
  "career",
  "money",
  "body",
  "learning",
  "uncertainty",
  "creation",
  "meaning",
]);

export type Domain = z.infer<typeof DomainSchema>;

export const ProvenanceSchema = z.enum(["U0", "Q", "A", "I", "G"]);

export type Provenance = z.infer<typeof ProvenanceSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const TemporalLayerSchema = z.enum(["past", "current", "emerging"]);
export type TemporalLayer = z.infer<typeof TemporalLayerSchema>;

export const Position3DSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export type Position3D = z.infer<typeof Position3DSchema>;

export const SourceExcerptSchema = z.object({
  id: IdentifierSchema,
  conversationId: z.string().min(1).max(500).optional(),
  conversationTitle: z.string().max(500).optional(),
  messageId: z.string().min(1).max(500).optional(),
  role: z.enum(["user", "assistant", "system", "tool", "unknown"]),
  provenance: ProvenanceSchema,
  confidence: ConfidenceSchema,
  confidenceNote: z.string().max(2_000).optional(),
  sensitive: z.boolean(),
  text: z.string().min(1).max(250_000),
  contentHash: Sha256Schema,
  createdAt: z.string().datetime().nullable().optional(),
});

export type SourceExcerpt = z.infer<typeof SourceExcerptSchema>;

export const BeliefNodeSchema = z
  .object({
    id: IdentifierSchema,
    kind: NodeKindSchema,
    label: z.string().min(1).max(160),
    description: z.string().min(1).max(4_000),
    /** 0 is the innermost ring; larger values are farther from the centre. */
    depth: z.number().int().min(0).max(4),
    primaryDomain: DomainSchema,
    domains: z.array(DomainSchema).min(1).max(8),
    temporalLayer: TemporalLayerSchema,
    /** Subjective importance in the person's current life, not an objective score. */
    impact: z.number().int().min(1).max(5),
    /** Subjective conviction at the latest edit, not a clinical measurement. */
    strength: z.number().int().min(1).max(5),
    confidence: ConfidenceSchema,
    confidenceNote: z.string().max(2_000).optional(),
    sensitive: z.boolean(),
    provenance: z.array(ProvenanceSchema).min(1).max(5),
    sourceExcerptIds: z.array(IdentifierSchema).max(100),
    status: z.enum([
      "active",
      "candidate",
      "emerging",
      "under-review",
      "archived",
    ]),
    tags: z.array(z.string().min(1).max(80)).max(40),
    position: Position3DSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((node, context) => {
    if (!node.domains.includes(node.primaryDomain)) {
      context.addIssue({
        code: "custom",
        path: ["primaryDomain"],
        message: "primaryDomain must also appear in domains",
      });
    }

    if (new Set(node.domains).size !== node.domains.length) {
      context.addIssue({
        code: "custom",
        path: ["domains"],
        message: "domains must not contain duplicates",
      });
    }

    if (new Set(node.provenance).size !== node.provenance.length) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "provenance must not contain duplicates",
      });
    }
  });

export type BeliefNode = z.infer<typeof BeliefNodeSchema>;

export const EdgeKindSchema = z.enum([
  "supports",
  "conflicts-with",
  "shapes",
  "protects",
  "drives",
  "reinforces",
  "challenges",
  "reframes",
  "tests",
  "originated-from",
  "activates",
  "leads-to",
]);

export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const BeliefEdgeSchema = z.object({
  id: IdentifierSchema,
  source: IdentifierSchema,
  target: IdentifierSchema,
  kind: EdgeKindSchema,
  label: z.string().min(1).max(240),
  bidirectional: z.boolean(),
  confidence: ConfidenceSchema,
  sensitive: z.boolean(),
  provenance: z.array(ProvenanceSchema).min(1).max(5),
  sourceExcerptIds: z.array(IdentifierSchema).max(100),
});

export type BeliefEdge = z.infer<typeof BeliefEdgeSchema>;

export const CheckInSchema = z.object({
  id: IdentifierSchema,
  nodeId: IdentifierSchema,
  at: z.string().datetime(),
  /** Subjective salience, not a clinical measurement. */
  strength: z.number().min(0).max(1),
  /** How activated the belief felt in that moment. */
  activation: z.number().min(0).max(1),
  note: z.string().max(4_000).optional(),
  context: z.string().max(1_000).optional(),
  sourceExcerptIds: z.array(IdentifierSchema).max(100),
});

export type CheckIn = z.infer<typeof CheckInSchema>;

export const CoverageSchema = z
  .object({
    sourceType: z.enum([
      "curated-seed",
      "chatgpt-zip",
      "chatgpt-json",
      "text",
      "belief-map-json",
    ]),
    filesSeen: z.number().int().min(0),
    filesAccepted: z.number().int().min(0),
    conversationCount: z.number().int().min(0),
    messageCount: z.number().int().min(0),
    uniqueMessageCount: z.number().int().min(0),
    duplicateMessageCount: z.number().int().min(0),
    userMessageCount: z.number().int().min(0),
    assistantMessageCount: z.number().int().min(0),
    systemMessageCount: z.number().int().min(0),
    toolMessageCount: z.number().int().min(0),
    unknownRoleMessageCount: z.number().int().min(0),
    emptyMessageCount: z.number().int().min(0),
    contentHashes: z.array(Sha256Schema),
    earliestAt: z.string().datetime().nullable(),
    latestAt: z.string().datetime().nullable(),
    warnings: z.array(z.string().min(1).max(2_000)),
  })
  .superRefine((coverage, context) => {
    if (coverage.filesAccepted > coverage.filesSeen) {
      context.addIssue({
        code: "custom",
        path: ["filesAccepted"],
        message: "filesAccepted cannot exceed filesSeen",
      });
    }

    if (
      coverage.uniqueMessageCount +
        coverage.duplicateMessageCount +
        coverage.emptyMessageCount !==
      coverage.messageCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["uniqueMessageCount"],
        message:
          "uniqueMessageCount, duplicateMessageCount, and emptyMessageCount must sum to messageCount",
      });
    }

    const roleTotal =
      coverage.userMessageCount +
      coverage.assistantMessageCount +
      coverage.systemMessageCount +
      coverage.toolMessageCount +
      coverage.unknownRoleMessageCount;
    if (roleTotal !== coverage.messageCount) {
      context.addIssue({
        code: "custom",
        path: ["messageCount"],
        message: "role counts must sum to messageCount",
      });
    }

    if (coverage.contentHashes.length !== coverage.uniqueMessageCount) {
      context.addIssue({
        code: "custom",
        path: ["contentHashes"],
        message: "contentHashes must contain one digest per unique message",
      });
    }
    if (new Set(coverage.contentHashes).size !== coverage.contentHashes.length) {
      context.addIssue({
        code: "custom",
        path: ["contentHashes"],
        message: "contentHashes must not contain duplicates",
      });
    }
  });

export type Coverage = z.infer<typeof CoverageSchema>;

/** Evidence is represented by a source excerpt in v1. */
export const EvidenceSchema = SourceExcerptSchema;
export type Evidence = SourceExcerpt;

export const BeliefMapMetadataSchema = z.object({
  locale: z.string().min(2).max(35),
  provenanceLegend: z.record(ProvenanceSchema, z.string().min(1).max(1_000)),
  disclaimer: z.string().min(1).max(4_000),
});

export const BeliefMapSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdentifierSchema,
    title: z.string().min(1).max(240),
    description: z.string().max(4_000).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    nodes: z.array(BeliefNodeSchema).max(10_000),
    edges: z.array(BeliefEdgeSchema).max(40_000),
    sourceExcerpts: z.array(SourceExcerptSchema).max(100_000),
    checkIns: z.array(CheckInSchema).max(100_000),
    coverage: CoverageSchema.optional(),
    metadata: BeliefMapMetadataSchema,
  })
  .superRefine((map, context) => {
    addDuplicateIdIssues(map.nodes, "nodes", context);
    addDuplicateIdIssues(map.edges, "edges", context);
    addDuplicateIdIssues(map.sourceExcerpts, "sourceExcerpts", context);
    addDuplicateIdIssues(map.checkIns, "checkIns", context);

    const nodeIds = new Set(map.nodes.map((node) => node.id));
    const sourceIds = new Set(map.sourceExcerpts.map((source) => source.id));

    map.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source)) {
        context.addIssue({
          code: "custom",
          path: ["edges", index, "source"],
          message: `edge source does not exist: ${edge.source}`,
        });
      }
      if (!nodeIds.has(edge.target)) {
        context.addIssue({
          code: "custom",
          path: ["edges", index, "target"],
          message: `edge target does not exist: ${edge.target}`,
        });
      }
      addMissingSourceIssues(
        edge.sourceExcerptIds,
        sourceIds,
        ["edges", index, "sourceExcerptIds"],
        context,
      );
    });

    map.nodes.forEach((node, index) => {
      addMissingSourceIssues(
        node.sourceExcerptIds,
        sourceIds,
        ["nodes", index, "sourceExcerptIds"],
        context,
      );
    });

    map.checkIns.forEach((checkIn, index) => {
      if (!nodeIds.has(checkIn.nodeId)) {
        context.addIssue({
          code: "custom",
          path: ["checkIns", index, "nodeId"],
          message: `check-in node does not exist: ${checkIn.nodeId}`,
        });
      }
      addMissingSourceIssues(
        checkIn.sourceExcerptIds,
        sourceIds,
        ["checkIns", index, "sourceExcerptIds"],
        context,
      );
    });
  });

export type BeliefMap = z.infer<typeof BeliefMapSchema>;

type Identified = { id: string };

function addDuplicateIdIssues(
  records: Identified[],
  path: "nodes" | "edges" | "sourceExcerpts" | "checkIns",
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();
  records.forEach((record, index) => {
    if (seen.has(record.id)) {
      context.addIssue({
        code: "custom",
        path: [path, index, "id"],
        message: `duplicate id: ${record.id}`,
      });
    }
    seen.add(record.id);
  });
}

function addMissingSourceIssues(
  ids: string[],
  availableIds: Set<string>,
  path: (string | number)[],
  context: z.RefinementCtx,
) {
  ids.forEach((id, index) => {
    if (!availableIds.has(id)) {
      context.addIssue({
        code: "custom",
        path: [...path, index],
        message: `source excerpt does not exist: ${id}`,
      });
    }
  });
}
