import JSZip from "jszip";
import { z } from "zod";
import {
  BeliefMapSchema,
  CoverageSchema,
  type BeliefMap,
  type Coverage,
  type Provenance,
  type SourceExcerpt,
} from "./belief-types";
import { deserializeBeliefMap } from "./serialization";

const MAX_INPUT_BYTES = 250 * 1024 * 1024;
const MAX_TEXT_CHARS = 100 * 1024 * 1024;
const FALLBACK_AT = "1970-01-01T00:00:00.000Z";

const ChatMessageSchema = z
  .object({
    id: z.string().optional(),
    author: z
      .object({ role: z.string().optional() })
      .passthrough()
      .optional(),
    create_time: z.union([z.number(), z.string(), z.null()]).optional(),
    content: z
      .object({
        content_type: z.string().optional(),
        parts: z.array(z.unknown()).optional(),
        text: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const MappingNodeSchema = z
  .object({
    id: z.string().optional(),
    message: ChatMessageSchema.nullable().optional(),
    parent: z.string().nullable().optional(),
    children: z.array(z.string()).optional(),
  })
  .passthrough();

const ConversationSchema = z
  .object({
    id: z.string().optional(),
    conversation_id: z.string().optional(),
    title: z.string().optional(),
    mapping: z.record(z.string(), MappingNodeSchema),
  })
  .passthrough();

const ConversationsSchema = z.array(ConversationSchema);

export type ChatGPTImportResult = {
  map?: BeliefMap;
  conversations: ImportedConversation[];
  coverage: Coverage;
  warnings: string[];
};

export type ImportedMessage = {
  id: string;
  role: SourceExcerpt["role"];
  content: string;
  createdAt: string | null;
};

export type ImportedConversation = {
  id: string;
  title: string;
  messages: ImportedMessage[];
};

type ExtractedMessage = {
  conversationId?: string;
  conversationTitle?: string;
  messageId?: string;
  role: SourceExcerpt["role"];
  text: string;
  createdAt: string | null;
};

/**
 * Parses a ChatGPT ZIP/JSON export or a plain TXT file entirely in the browser.
 * Imported messages become evidence only; no personal belief is inferred from
 * them automatically.
 */
export async function parseChatGPTFile(file: File): Promise<ChatGPTImportResult> {
  if (file.size > MAX_INPUT_BYTES) {
    return emptyResult("text", [
      `文件超过 ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)} MB 的前端导入上限。`,
    ]);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = file.name.toLocaleLowerCase().split(".").pop() ?? "";
  const isZip =
    extension === "zip" ||
    (bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(bytes[2] ?? -1) &&
      [0x04, 0x06, 0x08].includes(bytes[3] ?? -1));

  if (isZip) {
    return parseZip(bytes);
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.length > MAX_TEXT_CHARS) {
    return emptyResult("text", ["解压后的文本太大，已停止导入。"]);
  }

  if (
    extension === "json" ||
    file.type.includes("json") ||
    ["[", "{"].includes(text.replace(/^\uFEFF/, "").trimStart().charAt(0))
  ) {
    return parseJsonText(text, "chatgpt-json");
  }

  return parsePlainText(text, file.name);
}

/** Exposed for deterministic unit tests and non-File browser integrations. */
export async function parseChatGPTPayload(
  payload: unknown,
  sourceType: "chatgpt-json" | "chatgpt-zip" = "chatgpt-json",
): Promise<ChatGPTImportResult> {
  if (isBeliefMapCandidate(payload)) {
    try {
      const map = deserializeBeliefMap(JSON.stringify(payload));
      const coverage = BeliefMapSchema.parse(map).coverage ??
        createEmptyCoverage("belief-map-json");
      return { map, conversations: [], coverage, warnings: [] };
    } catch (error) {
      return emptyResult("belief-map-json", [describeError(error)]);
    }
  }

  const candidate = unwrapConversations(payload);
  const result = ConversationsSchema.safeParse(candidate);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("；");
    return emptyResult(sourceType, [
      `conversations.json 结构不符合 ChatGPT 导出格式：${detail}`,
    ]);
  }

  return buildConversationImport(result.data, sourceType);
}

async function parseZip(bytes: Uint8Array): Promise<ChatGPTImportResult> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const files = Object.values(zip.files).filter((entry) => !entry.dir);
    const candidates = files
      .filter(
        (entry) =>
          /(^|\/)conversations\.json$/i.test(entry.name),
      )
      .sort((left, right) => left.name.localeCompare(right.name));

    if (candidates.length === 0) {
      return emptyResult("chatgpt-zip", [
        "ZIP 中没有找到 conversations.json；请选择 ChatGPT 官方数据导出包。",
      ]);
    }

    const json = await candidates[0].async("string");
    if (json.length > MAX_TEXT_CHARS) {
      return emptyResult("chatgpt-zip", [
        "conversations.json 解压后过大，已停止导入。",
      ]);
    }

    const parsed = await parseJsonText(json, "chatgpt-zip");
    parsed.coverage.filesSeen = files.length;
    parsed.coverage.filesAccepted = parsed.map ? 1 : 0;
    if (candidates.length > 1) {
      parsed.warnings.push(
        `ZIP 中找到 ${candidates.length} 个 conversations.json，仅导入 ${candidates[0].name}。`,
      );
    }
    const unreadFiles = files.filter((entry) => !candidates.includes(entry));
    if (unreadFiles.length > 0) {
      parsed.warnings.push(
        `ZIP 中另有 ${unreadFiles.length} 个文件（可能包含附件或账户资料），本版没有读取；覆盖统计只针对 conversations.json。`,
      );
    }
    parsed.coverage.warnings = [...parsed.warnings];
    if (parsed.map) {
      parsed.map = BeliefMapSchema.parse({
        ...parsed.map,
        coverage: parsed.coverage,
      });
    }
    return parsed;
  } catch (error) {
    return emptyResult("chatgpt-zip", [
      `无法读取 ZIP：${describeError(error)}`,
    ]);
  }
}

async function parseJsonText(
  text: string,
  sourceType: "chatgpt-json" | "chatgpt-zip",
): Promise<ChatGPTImportResult> {
  let payload: unknown;
  try {
    payload = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
  } catch (error) {
    return emptyResult(sourceType, [
      `JSON 无法解析：${describeError(error)}`,
    ]);
  }
  return parseChatGPTPayload(payload, sourceType);
}

async function parsePlainText(
  text: string,
  filename: string,
): Promise<ChatGPTImportResult> {
  const normalized = normalizeText(text);
  if (!normalized) {
    return emptyResult("text", ["TXT 文件没有可导入的文字。"]);
  }

  const blocks = normalized
    .split(/\n\s*\n+/)
    .map(parseTextBlock)
    .filter((message): message is ExtractedMessage => message.text.length > 0);

  const messages = blocks.length > 0 ? blocks : [parseTextBlock(normalized)];
  messages.forEach((message, index) => {
    message.conversationId = `txt-${filename}`;
    message.conversationTitle = filename;
    message.messageId = `txt-message-${index + 1}`;
  });

  const warnings = [
    "TXT 不包含 ChatGPT 官方结构；角色与时间覆盖可能不完整。",
    "已将文本作为来源证据导入，没有自动推断任何个人信念。",
  ];
  const coverage = await buildCoverage(messages, "text", warnings, 1);
  const selectedMessages = await selectUniqueNonEmptyMessages(messages);
  const sources = await messagesToSourceExcerpts(selectedMessages);
  const map = buildEvidenceMap(sources, coverage, "导入的文字来源");
  const conversations = [
    {
      id: `txt-${filename}`,
      title: filename,
      messages: selectedMessages.map((message, index) => ({
        id: message.messageId ?? `txt-message-${index + 1}`,
        role: message.role,
        content: message.text,
        createdAt: message.createdAt,
      })),
    },
  ];

  return { map, conversations, coverage, warnings };
}

async function buildConversationImport(
  conversations: z.infer<typeof ConversationsSchema>,
  sourceType: "chatgpt-json" | "chatgpt-zip",
): Promise<ChatGPTImportResult> {
  const messagesByConversation = conversations.map(extractConversationMessages);
  const messages = messagesByConversation.flat().sort(compareMessages);
  const warnings = [
    "已导入原始消息作为来源证据，没有自动推断或确认任何个人信念。",
  ];
  const coverage = await buildCoverage(
    messages,
    sourceType,
    warnings,
    conversations.length,
  );
  const selectedMessages = await selectUniqueNonEmptyMessages(messages);
  const selectedSet = new Set(selectedMessages);
  const sources = await messagesToSourceExcerpts(selectedMessages);
  const map = buildEvidenceMap(sources, coverage, "ChatGPT 对话来源");
  const importedConversations: ImportedConversation[] = conversations.map(
    (conversation, index) => {
      const conversationId =
        conversation.id ?? conversation.conversation_id ?? `conversation-${index + 1}`;
      return {
        id: conversationId,
        title: conversation.title ?? "未命名对话",
        messages: messagesByConversation[index]
          .filter((message) => selectedSet.has(message))
          .sort(compareMessages)
          .map((message, messageIndex) => ({
            id: message.messageId ?? `${conversationId}-message-${messageIndex + 1}`,
            role: message.role,
            content: message.text,
            createdAt: message.createdAt,
          })),
      };
    },
  );
  return {
    map,
    conversations: importedConversations,
    coverage,
    warnings,
  };
}

function extractConversationMessages(
  conversation: z.infer<typeof ConversationSchema>,
): ExtractedMessage[] {
  const conversationId = conversation.id ?? conversation.conversation_id;
  return Object.entries(conversation.mapping).flatMap(([mappingId, node]) => {
    const message = node.message;
    if (!message) return [];
    return [
      {
        conversationId,
        conversationTitle: conversation.title,
        messageId: message.id ?? node.id ?? mappingId,
        role: normalizeRole(message.author?.role),
        text: extractMessageText(message.content),
        createdAt: normalizeTimestamp(message.create_time),
      },
    ];
  });
}

function extractMessageText(content: z.infer<typeof ChatMessageSchema>["content"]): string {
  if (!content) return "";
  if (typeof content.text === "string") return normalizeText(content.text);
  if (!Array.isArray(content.parts)) return "";

  return normalizeText(
    content.parts
      .flatMap((part) => {
        if (typeof part === "string") return [part];
        if (typeof part === "number" || typeof part === "boolean") {
          return [String(part)];
        }
        if (isRecord(part) && typeof part.text === "string") {
          return [part.text];
        }
        return [];
      })
      .join("\n"),
  );
}

async function messagesToSourceExcerpts(
  messages: ExtractedMessage[],
): Promise<SourceExcerpt[]> {
  const seen = new Set<string>();
  const sources: SourceExcerpt[] = [];

  for (const message of messages) {
    if (!message.text) continue;
    const hash = await sha256(message.text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    const provenance: Provenance = ["assistant", "system", "tool"].includes(
      message.role,
    )
      ? "A"
      : "Q";
    sources.push({
      id: `source-${hash}`,
      conversationId: message.conversationId,
      conversationTitle: message.conversationTitle,
      messageId: message.messageId,
      role: message.role,
      provenance,
      confidence: "high",
      confidenceNote:
        "对原消息文字的提取置信度高；这不等于其中任何信念解释已得到确认。",
      sensitive: true,
      text: message.text,
      contentHash: hash,
      createdAt: message.createdAt,
    });
  }

  return sources;
}

async function selectUniqueNonEmptyMessages(
  messages: ExtractedMessage[],
): Promise<ExtractedMessage[]> {
  const seen = new Set<string>();
  const selected: ExtractedMessage[] = [];
  for (const message of messages) {
    if (!message.text) continue;
    const hash = await sha256(message.text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    selected.push(message);
  }
  return selected;
}

async function buildCoverage(
  messages: ExtractedMessage[],
  sourceType: Coverage["sourceType"],
  warnings: string[],
  conversationCount: number,
): Promise<Coverage> {
  const hashes: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let empty = 0;
  const roleCounts = {
    user: 0,
    assistant: 0,
    system: 0,
    tool: 0,
    unknown: 0,
  };
  const dates: string[] = [];

  for (const message of messages) {
    roleCounts[message.role] += 1;
    if (message.createdAt) dates.push(message.createdAt);
    if (!message.text) {
      empty += 1;
      continue;
    }
    const hash = await sha256(message.text);
    if (seen.has(hash)) {
      duplicates += 1;
    } else {
      seen.add(hash);
      hashes.push(hash);
    }
  }

  dates.sort();
  return CoverageSchema.parse({
    sourceType,
    filesSeen: 1,
    filesAccepted: 1,
    conversationCount,
    messageCount: messages.length,
    uniqueMessageCount: hashes.length,
    duplicateMessageCount: duplicates,
    userMessageCount: roleCounts.user,
    assistantMessageCount: roleCounts.assistant,
    systemMessageCount: roleCounts.system,
    toolMessageCount: roleCounts.tool,
    unknownRoleMessageCount: roleCounts.unknown,
    emptyMessageCount: empty,
    contentHashes: hashes,
    earliestAt: dates.at(0) ?? null,
    latestAt: dates.at(-1) ?? null,
    warnings,
  });
}

function buildEvidenceMap(
  sources: SourceExcerpt[],
  coverage: Coverage,
  title: string,
): BeliefMap {
  const createdAt = coverage.earliestAt ?? FALLBACK_AT;
  const suffix = coverage.contentHashes[0]?.slice(0, 20) ?? "empty";
  return BeliefMapSchema.parse({
    schemaVersion: 1,
    id: `belief-map-import-${suffix}`,
    title,
    description:
      "消息已作为可追溯来源导入。请由用户选择文字并明确确认后，再创建或关联信念节点。",
    createdAt,
    updatedAt: coverage.latestAt ?? createdAt,
    nodes: [],
    edges: [],
    sourceExcerpts: sources,
    checkIns: [],
    coverage,
    metadata: {
      locale: "zh-CN",
      provenanceLegend: {
        U0: "本轮用户直接输入。",
        Q: "从历史对话提取的用户消息。",
        A: "从历史对话提取的助手消息。",
        I: "助手推断，需用户确认。",
        G: "待验证的桥梁假设。",
      },
      disclaimer:
        "导入仅建立来源档案，不自动判断哪句话是信念，也不提供心理或医疗诊断。",
    },
  });
}

function unwrapConversations(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload.conversations)) {
    return payload.conversations;
  }
  return payload;
}

function isBeliefMapCandidate(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    (payload.schemaVersion !== undefined ||
      (Array.isArray(payload.nodes) &&
        (Array.isArray(payload.edges) || Array.isArray(payload.relationships))))
  );
}

function parseTextBlock(block: string): ExtractedMessage {
  const normalized = normalizeText(block);
  const match = normalized.match(
    /^(user|human|用户|assistant|chatgpt|助手|system|系统|tool|工具)\s*[:：]\s*([\s\S]*)$/i,
  );
  return {
    role: match ? normalizeRole(match[1]) : "unknown",
    text: normalizeText(match ? match[2] : normalized),
    createdAt: null,
  };
}

function normalizeRole(role: string | undefined): SourceExcerpt["role"] {
  switch (role?.toLocaleLowerCase()) {
    case "user":
    case "human":
    case "用户":
      return "user";
    case "assistant":
    case "chatgpt":
    case "助手":
      return "assistant";
    case "system":
    case "系统":
      return "system";
    case "tool":
    case "工具":
      return "tool";
    default:
      return "unknown";
  }
}

function normalizeTimestamp(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  let milliseconds: number;
  if (typeof value === "number") {
    milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  } else {
    const numeric = Number(value);
    milliseconds = Number.isFinite(numeric)
      ? numeric < 10_000_000_000
        ? numeric * 1_000
        : numeric
      : Date.parse(value);
  }
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compareMessages(left: ExtractedMessage, right: ExtractedMessage): number {
  return (
    (left.createdAt ?? "9999").localeCompare(right.createdAt ?? "9999") ||
    (left.conversationId ?? "").localeCompare(right.conversationId ?? "") ||
    (left.messageId ?? "").localeCompare(right.messageId ?? "")
  );
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前浏览器不支持 Web Crypto，无法安全计算内容哈希。");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function emptyResult(
  sourceType: Coverage["sourceType"],
  warnings: string[],
): ChatGPTImportResult {
  const coverage = createEmptyCoverage(sourceType, warnings);
  return { conversations: [], coverage, warnings };
}

function createEmptyCoverage(
  sourceType: Coverage["sourceType"],
  warnings: string[] = [],
): Coverage {
  return CoverageSchema.parse({
    sourceType,
    filesSeen: 1,
    filesAccepted: 0,
    conversationCount: 0,
    messageCount: 0,
    uniqueMessageCount: 0,
    duplicateMessageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    systemMessageCount: 0,
    toolMessageCount: 0,
    unknownRoleMessageCount: 0,
    emptyMessageCount: 0,
    contentHashes: [],
    earliestAt: null,
    latestAt: null,
    warnings,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
