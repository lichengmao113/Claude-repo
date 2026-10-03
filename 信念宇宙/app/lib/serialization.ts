import { z } from "zod";
import { BeliefMapSchema, type BeliefMap, type Provenance } from "./belief-types";

const LEGACY_FALLBACK_AT = "1970-01-01T00:00:00.000Z";

export class BeliefMapImportError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "BeliefMapImportError";
    this.issues = issues;
  }
}

export type BeliefMapValidationResult =
  | { success: true; data: BeliefMap; errors: [] }
  | { success: false; errors: string[] };

/** A non-mutating, UI-friendly validation helper. */
export function validateBeliefMap(input: unknown): BeliefMapValidationResult {
  const result = BeliefMapSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, errors: [] };
  }
  return { success: false, errors: formatZodIssues(result.error) };
}

/**
 * Migrates a supported legacy payload and validates the result.
 *
 * Version 0 used `relationships` and `evidence`; version 1 names those fields
 * `edges` and `sourceExcerpts`. A missing version is treated as v0 only when
 * the payload has the old field names. No timestamps or identifiers are
 * generated at runtime, keeping this function deterministic and side-effect free.
 */
export function migrateBeliefMap(input: unknown): BeliefMap {
  if (!isRecord(input)) {
    throw new BeliefMapImportError("信念图谱必须是一个 JSON 对象。", [
      "root: expected object",
    ]);
  }

  const version = input.schemaVersion;
  if (version === 1) {
    return parseCandidate(input);
  }

  const looksLikeV0 =
    version === 0 ||
    (version === undefined &&
      (Array.isArray(input.relationships) || Array.isArray(input.evidence)));

  if (!looksLikeV0) {
    throw new BeliefMapImportError("无法识别信念图谱版本。", [
      `schemaVersion: ${String(version)}`,
    ]);
  }

  const createdAt = asIsoString(input.createdAt) ?? LEGACY_FALLBACK_AT;
  const legacy = input as Record<string, unknown>;
  const candidate: Record<string, unknown> = {
    ...legacy,
    schemaVersion: 1,
    id: typeof legacy.id === "string" ? legacy.id : "belief-map-migrated-v0",
    title:
      typeof legacy.title === "string" ? legacy.title : "迁移的信念图谱",
    createdAt,
    updatedAt: asIsoString(legacy.updatedAt) ?? createdAt,
    nodes: Array.isArray(legacy.nodes) ? legacy.nodes : [],
    edges: Array.isArray(legacy.edges)
      ? legacy.edges
      : Array.isArray(legacy.relationships)
        ? legacy.relationships
        : [],
    sourceExcerpts: Array.isArray(legacy.sourceExcerpts)
      ? legacy.sourceExcerpts
      : Array.isArray(legacy.evidence)
        ? legacy.evidence
        : [],
    checkIns: Array.isArray(legacy.checkIns) ? legacy.checkIns : [],
    metadata: isRecord(legacy.metadata)
      ? legacy.metadata
      : defaultMetadata(),
  };

  delete candidate.relationships;
  delete candidate.evidence;

  return parseCandidate(candidate);
}

/** Serializes only a fully valid v1 map. */
export function serializeBeliefMap(map: BeliefMap): string {
  const validated = BeliefMapSchema.safeParse(map);
  if (!validated.success) {
    const issues = formatZodIssues(validated.error);
    throw new BeliefMapImportError("无法导出：信念图谱未通过校验。", issues);
  }
  return JSON.stringify(validated.data, null, 2);
}

/** Parses JSON, migrates supported legacy data, and rejects damaged graphs. */
export function deserializeBeliefMap(text: string): BeliefMap {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new BeliefMapImportError("无法读取 JSON。", [detail]);
  }

  return migrateBeliefMap(raw);
}

function parseCandidate(candidate: unknown): BeliefMap {
  const result = BeliefMapSchema.safeParse(candidate);
  if (!result.success) {
    const issues = formatZodIssues(result.error);
    throw new BeliefMapImportError("信念图谱数据损坏或不完整。", issues);
  }
  return result.data;
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asIsoString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds)
    ? undefined
    : new Date(milliseconds).toISOString();
}

function defaultMetadata() {
  const provenanceLegend: Record<Provenance, string> = {
    U0: "用户直接输入。",
    Q: "既往用户原话转引。",
    A: "助手归纳。",
    I: "助手推断，需确认。",
    G: "待验证的桥梁假设。",
  };

  return {
    locale: "zh-CN",
    provenanceLegend,
    disclaimer:
      "这是自我探索工具，不用于判断信念真假，也不提供心理或医疗诊断。",
  };
}
