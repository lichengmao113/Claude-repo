import { BeliefMapSchema, type BeliefMap, type BeliefNode, type BeliefEdge, type SourceExcerpt } from "./belief-types";
import { initialBeliefMap } from "./seed";
import reviewedHistory from "./reviewed-history.json";

export const REVIEW_DATE = "2026-09-28T15:17:38.000Z";
export const REVIEW_MARKER = "review-2026-09-28-evidence";
const CURRENT_THREAD = "01a0e862-84b4-7d12-a650-6c1d816cfa97";

const currentStatements = [
  "我有时候害怕我做一件事，如果一开始特别用力，后面可能就没有精力去做，可能就没有更多的注意力去做。就像拔河一样，一开始用太多力，后面后劲就不足了。很多事我都会有这样的想法。",
  "我看书的时候似乎只关注最重要、最实际的内容，包括做事一样，我只关注最实际的事。",
  "我害怕我自己在读书的时候，去做一些无关紧要的事。我害怕我自己在专注读书的时候玩手机，因为它会牵着我的注意力。另一面，我似乎把手机注入了太多的概念，太多坏的概念，它会腐蚀我的注意力。",
  "我总是在发掘自己坏的信念，恐惧的认为坏的东西会不断的腐蚀我自己，会让我自己限制我自己，让自己变坏。但是我给我这些信念注入了太多的魔力，夸大了它的影响。也就是我夸大了错误造成的影响。，却从来没有去发展自己的新的信念。",
  "我似乎不太相信自己的创造能力，我限制我自己的创造力。",
  "那我的那些障碍存在理由是什么？（不能专注去学习，不能持之以恒的在一个长久的事情上去学，3 分钟热度。没有长期思维，总想着很快的见到效益。）",
  "我对于主线任务太看重了，忽略了其他的内容，只关心主线。我不太清楚这个对不对。",
  "有一个点，我发现我现在有很大的“阶级洁癖”，例如，我看了赛斯的个人实相的本质，我非常震惊这本书，然后我看到其他人其他视频讲解这本书的时候，我就下意识感觉他讲的肯定不行，我不愿意学，我以为自己已经有了最强的功法了，不愿意学。然后实则我根本没有强大的能力参悟到高级功法。",
  "我现在发现一个对于财富的信念就是：我似乎发现财富不会眷顾穷人或者普通人/如果我表现的太想要财富，就可以意味着我非常贪婪，没有道德，但是财富正常的积累就没有了/或者我认为财富不重要，道德和精神高才会有财富",
  "这些是我这段时间分析出的我的一些信念，第9条我不太确定暂时，但是我感觉我还有一些限制的。",
];

const refs = (numbers: number[]) => numbers.map((n) => `current-belief-${n}`);
type NodeInput = Pick<BeliefNode, "id" | "kind" | "label" | "description" | "sourceExcerptIds"> & Partial<BeliefNode>;

function node(input: NodeInput): BeliefNode {
  return {
    depth: 2, primaryDomain: "self", domains: ["self"], temporalLayer: "current",
    impact: 3, strength: 3, confidence: "medium", sensitive: true, provenance: ["I"],
    status: "candidate", createdAt: REVIEW_DATE, updatedAt: REVIEW_DATE,
    confidenceNote: "结构关系是候选解释；强度与影响的初始值为未评分占位，不是测量结果。",
    ...input,
    tags: [...(input.tags ?? []), "对话核对版"],
  };
}

const additions: BeliefNode[] = [
  node({ id: "rev-core-self-trust", kind: "limiting-core", label: "对调整与创造的信任有条件", description: "候选组织原则：要有足够确定、正确和可见的效益，才比较敢信任自己的投入。当前材料支持担心耗费、干扰和创造力不足；不能据此判定实际能力低。", depth: 1, sourceExcerptIds: refs([1, 3, 5]), tags: ["核心候选"] }),
  node({ id: "rev-rule-energy", kind: "rule", label: "投入太多会后劲不足", description: "明确表达过的担心：一开始用力，会减少后续可用的精力和注意力。合理安排强度与把投入看成必然耗尽，需要按具体经历区分。", primaryDomain: "learning", domains: ["learning", "body"], provenance: ["U0", "A"], confidence: "high", status: "under-review", sourceExcerptIds: refs([1]) }),
  node({ id: "rev-rule-utility", kind: "rule", label: "重要、实际、主线优先", description: "阅读和做事倾向于先筛选实际效益与主线相关性。这是明确的选择倾向；它是否已经排除了必要的探索、背景和休息，仍需结合具体情境判断。", primaryDomain: "learning", domains: ["learning", "meaning"], provenance: ["U0", "A"], confidence: "high", status: "under-review", sourceExcerptIds: refs([2, 7]) }),
  node({ id: "rev-rule-phone", kind: "rule", label: "手机被赋予较强干扰意义", description: "既担心实际被手机牵走注意力，也察觉自己给手机加上了很多坏的概念。环境边界与对自我受损的解释，两部分并存。", primaryDomain: "learning", domains: ["learning", "self"], provenance: ["U0", "A"], confidence: "high", status: "under-review", sourceExcerptIds: refs([3]) }),
  node({ id: "rev-rule-action-weight", kind: "rule", label: "单次行动应改变很多", description: "过去直接说过给行动赋予太重的意义，总想每个行动改变很多东西。它可能提高普通推进的评价门槛；不等于已证明所有行动都在证明人格价值。", primaryDomain: "creation", domains: ["creation", "self", "learning"], provenance: ["U0", "A"], confidence: "high", status: "under-review", sourceExcerptIds: ["history-e04"] }),
  node({ id: "rev-rule-finish-once", kind: "rule", label: "最好一次学完，少再返工", description: "希望一次学完、以后不必再学，同时明确知道学习需要查漏补缺。怕返工的成本和对迭代的理解在同一系统里并存。", primaryDomain: "learning", domains: ["learning", "uncertainty"], provenance: ["U0", "A"], confidence: "high", status: "under-review", sourceExcerptIds: ["history-e06", "history-e07", "history-e08"] }),
  node({ id: "rev-rule-source-rank", kind: "rule", label: "按知识来源等级预判价值", description: "面对震撼自己的原著，容易预判普通讲解不够好；同时怀疑自己的参悟能力。这支持学习入口的筛选倾向，不足以认定阶级观、自恋或害怕被看低。", primaryDomain: "learning", domains: ["learning", "self"], provenance: ["U0", "A"], confidence: "high", status: "under-review", sourceExcerptIds: refs([8]) }),
  node({ id: "rev-rule-money-morality", kind: "rule", label: "财富、欲望与道德：未确定", description: "原话包含三个不同疑问：普通人的机会、想要财富是否贪婪、精神与财富的关系。本人明确暂不确定，不能归并为排斥财富、害怕成功或不配得。", primaryDomain: "money", domains: ["money", "meaning", "self"], confidence: "low", provenance: ["U0", "A"], sourceExcerptIds: refs([9, 10]), tags: ["未确定分支"] }),
  node({ id: "rev-rule-self-blame", kind: "rule", label: "从中断推向整体能力评价", description: "过去说过戒烟、锻炼都坚持过一段时间，但未持续后追问意志力为何薄弱。原话同时包含持续过的事实与整体能力评价，两者需要并列保留。", primaryDomain: "self", domains: ["self", "life"], provenance: ["U0", "A"], confidence: "high", status: "under-review", sourceExcerptIds: ["history-e18", "history-e17", ...refs([6])] }),
  node({ id: "rev-focus-adequacy", kind: "strategy", label: "聚焦：我是否够好、状态对不对", description: "意识心的一个候选聚焦方向：在参与事情时，同时评估自己的准备、状态和表现是否达标。这是对材料的归纳，不是注意时间的测量。", depth: 3, sourceExcerptIds: ["history-e03", "history-e04", "history-e15", "history-e19"], tags: ["意识心焦点"] }),
  node({ id: "rev-focus-cost", kind: "strategy", label: "聚焦：投入值不值、多久见效", description: "反复关注重要性、实用性、返工成本和结果出现的速度。可能使不确定用途的经验较难获得位置，不能认定一切效率偏好都有问题。", depth: 3, primaryDomain: "learning", domains: ["learning", "meaning"], sourceExcerptIds: ["history-e08", ...refs([1, 2, 6, 7])], tags: ["意识心焦点"] }),
  node({ id: "rev-focus-threat", kind: "strategy", label: "聚焦：哪里会消耗、干扰或变坏", description: "对精力消耗、注意力被牵走、坏信念影响自己的可能性较敏感。关注风险与风险真的发生不是同一件事。", depth: 3, sourceExcerptIds: ["history-e20", ...refs([1, 3, 4])], tags: ["意识心焦点"] }),
  node({ id: "rev-focus-participation", kind: "strategy", label: "聚焦：内容、探索与即时反馈", description: "游戏投入、享受小说、主动整理学习档案、核对分析依据，都表明也存在投入内容和主动参与的注意方式。不能把自我检查视为全部注意活动。", depth: 3, primaryDomain: "creation", domains: ["creation", "learning", "life"], provenance: ["A"], sourceExcerptIds: ["history-e01", "history-e09", "history-e11", "history-e13"], tags: ["意识心焦点", "反证与资源"] }),
  node({ id: "rev-feeling-urgency", kind: "emotion-body", label: "感受线索：急迫与重负", description: "单次行动希望改变很多、想尽快恢复、担心重新学习等语境里，可观察到急迫与负担的色彩。是情境中的感受归纳，不等于本质感觉基调。", depth: 3, provenance: ["A"], temporalLayer: "past", sourceExcerptIds: ["history-e04", "history-e08", "history-e16"], tags: ["感受线索"] }),
  node({ id: "rev-feeling-wariness", kind: "emotion-body", label: "感受线索：戒备与担心", description: "在注意力、错误信念和重大挫折相关表达中，害怕与防护的色彩较突出。不同领域可能有不同原因，不能统一定为稳定恐惧人格。", depth: 3, provenance: ["A"], sourceExcerptIds: ["history-e12", "history-e20", ...refs([1, 3, 4])], tags: ["感受线索"] }),
  node({ id: "rev-feeling-absorption", kind: "emotion-body", label: "感受线索：沉浸、活跃与乐趣", description: "描述游戏时明确说过超级专注、很有乐趣、大脑全身心投入。这是专注与兴趣存在的直接反证；不推定职业适配，也不把通宵作为范式。", depth: 3, provenance: ["A"], confidence: "high", temporalLayer: "past", sourceExcerptIds: ["history-e13", "history-e14"], tags: ["感受线索", "反证与资源"] }),
  node({ id: "rev-feeling-relief", kind: "emotion-body", label: "感受线索：放松、安定与享受", description: "回老家后说放下很多、没那么焦虑和彷徨，并享受小说。这说明感受随环境和活动变化，不支持持续焦虑或无愉悦能力的总判断。", depth: 3, provenance: ["A"], confidence: "high", temporalLayer: "past", sourceExcerptIds: ["history-e10", "history-e11"], tags: ["感受线索", "反证与资源"] }),
  node({ id: "rev-behavior-checking", kind: "behavior", label: "反复找限制、检查内部状态", description: "本轮明确说总在发掘坏信念，也察觉夸大了它的影响。记录的是自述行为及解释，不将检查自动视为疾病或确定成因。", depth: 4, provenance: ["U0", "A"], confidence: "high", status: "under-review", sourceExcerptIds: refs([4]) }),
  node({ id: "rev-behavior-hesitation", kind: "behavior", label: "重要任务前犹豫或回避", description: "曾报告状态不对时不做、想学交易却逃避、损失后尚未开始复盘。现实损失、任务难度、作息和学习方法仍有独立解释力。", depth: 4, provenance: ["U0", "A"], confidence: "high", temporalLayer: "past", status: "under-review", sourceExcerptIds: ["history-e03", "history-e05", "history-e12"] }),
  node({ id: "rev-behavior-revise", kind: "behavior", label: "主动核对、组织与参与", description: "会纠正不贴合的解释、要求重读原话、承认学习需查漏补缺，并寻找具体组织方式。这些是已经表达的参与行为，不是尚未实践的积极口号。", depth: 4, primaryDomain: "learning", domains: ["learning", "creation"], provenance: ["U0", "A"], confidence: "high", temporalLayer: "past", status: "under-review", sourceExcerptIds: ["history-e01", "history-e02", "history-e07", "history-e09"], tags: ["反证与资源"] }),
  node({ id: "rev-context-loss", kind: "trigger", label: "情境：现实损失与生活变化", description: "过去的复盘恐惧发生在具体重大损失之后；恢复行动力的提问也有生活变化背景。外部条件独立进入图谱，不能把所有困难归因于信念。", depth: 4, primaryDomain: "life", domains: ["life", "money", "career"], provenance: ["U0", "A"], confidence: "high", temporalLayer: "past", sourceExcerptIds: ["history-e12", "history-e16"], tags: ["外部情境"] }),
  node({ id: "rev-context-participation", kind: "trigger", label: "情境：参与方式与熟悉环境", description: "主动操作游戏与感觉被动接受的学习形成差异；回家后感受放松。可核验的是情境差异，原因仍可有多种解释。", depth: 4, primaryDomain: "life", domains: ["life", "learning", "creation"], provenance: ["U0", "A"], confidence: "high", temporalLayer: "past", sourceExcerptIds: ["history-e10", "history-e13", "history-e14"], tags: ["外部情境"] }),
];

const patches: Record<string, Partial<BeliefNode>> = {
  "value-autonomy": { confidence: "medium", provenance: ["A"], sourceExcerptIds: ["history-e01", "history-e02"], description: "候选价值方向：保留自己的判断和选择权。反复要求核对旧解释、区分不同思想框架，为这一方向提供具体材料。" },
  "value-capability": { confidence: "medium", provenance: ["A"], sourceExcerptIds: ["history-e07", "history-e09", "history-e16"], description: "重视理解、学习与实际参与。恢复能力的愿望和主动组织学习的行为并存，不能由困难直接推断能力缺失。" },
  "value-connection": { confidence: "low", status: "candidate", description: "旧图谱归纳的关系与被喜欢的价值方向。已核对材料包含愉快社交，但不足以确定被喜欢是否是主要条件，保留为待补证分支。", sourceExcerptIds: ["history-e17"], provenance: ["I"] },
  "value-aliveness": { confidence: "medium", provenance: ["A"], sourceExcerptIds: ["history-e10", "history-e11", "history-e13"], description: "对投入、乐趣与放松的体验有直接描述。可归纳为希望生活有参与感与体验的丰富性，而不把全部活动仅看成效益。" },
  "core-resource-author": { confidence: "medium", provenance: ["A"], sourceExcerptIds: ["history-e01", "history-e02", "history-e09"], description: "资源性候选：自己的判断可以参与生活与解释的形成。实际材料包含纠正助手、要求核对依据和主动组织学习。", status: "candidate" },
  "core-resource-understand-change": { confidence: "medium", provenance: ["A"], sourceExcerptIds: ["history-e07", "history-e09"], description: "资源性候选：复杂内容可以逐步理解，已有认识可以通过查漏补缺修正。本人既知道迭代必要，也会担心它的成本。", status: "candidate" },
  "core-limiting-conditional-worth": { label: "成果与自我认可相联系", description: "重要历史候选：成果可能承担确认能力、价值和选择的任务。旧分析转引过离职后的价值感与交易证明动机；本轮另有行动意义过重的直接材料。不能推广为整个人无价值或一切行为都在证明自己。", confidence: "medium", provenance: ["I"], sourceExcerptIds: ["history-e19", "history-e04"], status: "candidate", confidenceNote: "自我价值相关原句本次只从旧助手转引中核对到；行动意义过重是直接原话。" },
  "core-limiting-completeness": { label: "安心行动需要充分准备", description: "候选组织原则：状态对、准备充分、第一次做好，才比较安心开始。来自多次明确表达，但不是对全部生活领域的判断。", confidence: "medium", provenance: ["I"], sourceExcerptIds: ["history-e03", "history-e15", "history-e06"], status: "candidate" },
  "core-limiting-thought-responsibility": { label: "心理活动可能伤害自己", description: "候选组织原则：担心坏念头、坏信念本身带来损害，因此需要发现和纠正。当前第4条直接支持这种担心，过去外貌领域只有旧文转引；图不认可念头自动造成外部事件。", confidence: "medium", provenance: ["I"], sourceExcerptIds: ["history-e20", ...refs([3, 4])], status: "candidate" },
  "rule-understand-before-act": { label: "准备好、状态对、第一遍做好", description: "过去直接表达过的行动条件；可能抬高开始门槛。它不等于真实任务不需要准备，而是检查条件是否被扩大。", confidence: "high", provenance: ["U0", "A"], sourceExcerptIds: ["history-e03", "history-e15"], status: "under-review" },
  "rule-control-thought": { label: "需要及时纠正坏念头与信念", description: "候选规则：发现坏念头或限制信念后，倾向于及时检查和纠正，以防它影响自己。担心本身有直接自述，但不表示每个念头都会造成损害。", confidence: "medium", provenance: ["I"], sourceExcerptIds: ["history-e20", ...refs([4])], status: "candidate" },
  "rule-leap-compress-time": { label: "期待尽快见效、减少漫长过程", description: "当前明确希望很快见效，过去希望单次行动改变很多。‘缓慢积累一定来不及’仍无直接依据，不能作为已确认规则。", confidence: "medium", provenance: ["A"], sourceExcerptIds: ["history-e04", "history-e16", ...refs([6])], status: "candidate" },
  "rule-money-freedom": { confidence: "low", status: "candidate", provenance: ["I"], description: "旧版助手举例：只有有足够的钱才能自由。没有本轮核实的用户原句，不作为已确认核心。", tags: ["未确定分支", "旧版例句"] },
  "rule-growth-escape": { confidence: "low", status: "candidate", provenance: ["I"], description: "旧版助手举例：高增长行业才能摆脱受限生活。本轮没有直接原话，保留为历史候选。", tags: ["未确定分支", "旧版例句"] },
  "rule-exceptional-respect": { confidence: "low", status: "candidate", provenance: ["I"], description: "旧版候选：不普通才不被看低。尚不能用学习来源的等级判断来证实它，关系与尊重需要独立材料。", tags: ["未确定分支"] },
  "rule-vigilance-reliable": { status: "archived", confidence: "low", description: "旧分析已指出‘必须靠紧张维持安全’未找到用户原话，本次退出默认架构。原记录保留可追溯。" },
};

const links: [string, string, string, BeliefEdge["kind"]?][] = [
  ["value-capability", "rev-rule-action-weight", "能力愿望可能被附加较高成果要求"],
  ["value-autonomy", "core-resource-author", "自主价值与主动判断相呼应", "supports"],
  ["value-aliveness", "rev-focus-participation", "体验与内容参与相呼应", "supports"],
  ["core-limiting-conditional-worth", "rev-rule-action-weight", "成果可能承担自我认可任务"],
  ["core-limiting-completeness", "rev-rule-finish-once", "充分掌握的要求可能延伸到一次完成"],
  ["core-limiting-completeness", "rule-understand-before-act", "核心候选与明确行动条件的联系"],
  ["rev-core-self-trust", "rev-rule-energy", "对持续能力的信任与耗费担心可能相连"],
  ["rev-core-self-trust", "rev-rule-phone", "对自我受影响的解释可能相连"],
  ["core-limiting-thought-responsibility", "rev-focus-threat", "念头危险评价可能组织注意"],
  ["rev-rule-energy", "rev-focus-cost", "可能突出未来投入成本"],
  ["rev-rule-utility", "rev-focus-cost", "重要性和效益进入注意筛选"],
  ["rev-rule-finish-once", "rev-focus-cost", "返工预期与成本聚焦相连"],
  ["rev-rule-action-weight", "rev-focus-adequacy", "行动意义与表现检查可能相连"],
  ["rule-understand-before-act", "rev-focus-adequacy", "状态成为行动评估对象"],
  ["rev-rule-phone", "rev-focus-threat", "实际干扰和受损解释需区分"],
  ["rev-rule-source-rank", "rev-focus-cost", "来源等级可能成为价值筛选依据"],
  ["rev-rule-money-morality", "core-limiting-conditional-worth", "财富的道德意义与价值证明关系尚不确定", "conflicts-with"],
  ["rev-rule-self-blame", "rev-focus-adequacy", "中断可能被解释为整体能力不足"],
  ["rev-focus-adequacy", "rev-feeling-urgency", "在高意义任务中可能共同出现"],
  ["rev-focus-cost", "rev-feeling-urgency", "成本和效益评估可能伴随急迫"],
  ["rev-focus-threat", "rev-feeling-wariness", "风险聚焦与担心可能互相加强", "reinforces"],
  ["rev-focus-participation", "rev-feeling-absorption", "内容参与与沉浸在材料中共现", "supports"],
  ["rev-feeling-wariness", "rev-behavior-checking", "担心可能引出进一步检查"],
  ["rev-behavior-checking", "rev-focus-threat", "检查可能让威胁更显眼", "reinforces"],
  ["rev-feeling-urgency", "rev-behavior-hesitation", "要求沉重时可能伴随犹豫"],
  ["rev-behavior-hesitation", "rev-rule-self-blame", "中断后可能再次整体评价自己", "reinforces"],
  ["rev-feeling-absorption", "rev-core-self-trust", "对缺乏投入能力的总判断提供反证", "challenges"],
  ["rev-feeling-relief", "rev-feeling-wariness", "不同情境的体验反对固定基调定性", "challenges"],
  ["core-resource-understand-change", "rev-behavior-revise", "过程理解与主动修正相呼应", "supports"],
  ["core-resource-author", "rev-behavior-revise", "保留判断与核对行为相呼应", "supports"],
  ["rev-behavior-revise", "rev-focus-participation", "具体组织与核对可使注意进入参与", "supports"],
  ["rev-context-loss", "rev-feeling-wariness", "现实损失是独立情境因素", "activates"],
  ["rev-context-participation", "rev-feeling-relief", "环境变化与放松体验共现", "supports"],
  ["rev-context-participation", "rev-feeling-absorption", "参与方式可能影响投入体验", "supports"],
  ["rev-focus-adequacy", "rev-focus-participation", "同一注意系统中两种聚焦位置", "conflicts-with"],
];

async function hashText(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function reviewedExcerpts(): Promise<SourceExcerpt[]> {
  const raw = [
    ...reviewedHistory,
    ...currentStatements.map((text, index) => ({
      id: `current-belief-${index + 1}`, conversationId: CURRENT_THREAD,
      conversationTitle: "梳理信念与潜在限制 · 本轮自述", role: "user", provenance: "U0",
      text, createdAt: null, sensitive: true,
      confidenceNote: "本轮用户原文的连续摘录；日期为 2026-09-28，未虚构消息时间与消息标识。",
    })),
    { id: REVIEW_MARKER, role: "assistant", provenance: "A", sensitive: false, createdAt: REVIEW_DATE,
      text: "2026-09-28 对话证据修订。核对 8 个历史聊天中的选定摘录及本轮自述，并非全部历史。核心与连线是候选解释；感受线索不等于本质感觉基调；已有用户修改优先保留。" },
  ];
  return Promise.all(raw.map(async (item) => ({
    ...item, role: item.role as SourceExcerpt["role"], provenance: item.provenance as SourceExcerpt["provenance"],
    confidence: item.provenance === "U0" ? "high" : "medium", contentHash: await hashText(item.text),
  } as SourceExcerpt)));
}

function sameRecord(a: unknown, b: unknown) {
  const comparable = (value: unknown) => {
    const record = { ...(value as Record<string, unknown>) };
    delete record.position;
    return JSON.stringify(record);
  };
  return comparable(a) === comparable(b);
}

/** Apply once, replace only untouched starter records, and preserve user edits. */
export async function applySystemRevision(input: BeliefMap): Promise<BeliefMap> {
  if (input.sourceExcerpts.some((item) => item.id === REVIEW_MARKER)) return input;
  const map = structuredClone(input);
  const baseline = new Map(initialBeliefMap.nodes.map((item) => [item.id, item]));
  map.nodes = map.nodes.map((item) => {
    const original = baseline.get(item.id);
    if (!original || !sameRecord(item, original)) return item;
    const patch = patches[item.id];
    if (!patch) return { ...item, tags: [...item.tags, "旧版待补证"] };
    return { ...item, ...patch, tags: [...(patch.tags ?? item.tags), "对话核对版"], updatedAt: REVIEW_DATE };
  });
  const existingIds = new Set(map.nodes.map((item) => item.id));
  map.nodes.push(...additions.filter((item) => !existingIds.has(item.id)).map((item) => structuredClone(item)));
  const nodeById = new Map(map.nodes.map((item) => [item.id, item]));
  const previousEdges = new Map(initialBeliefMap.edges.map((item) => [item.id, item]));
  map.edges = map.edges.map((edge) => {
    const original = previousEdges.get(edge.id);
    if (!original || !sameRecord(edge, original)) return edge;
    return { ...edge, confidence: "low", provenance: ["I"], label: `旧版关系候选：${edge.label}` };
  });
  const edgeIds = new Set(map.edges.map((item) => item.id));
  links.forEach(([source, target, label, kind = "shapes"], index) => {
    const id = `rev-edge-${index + 1}`;
    if (edgeIds.has(id) || !nodeById.has(source) || !nodeById.has(target)) return;
    const excerpts = [...new Set([...nodeById.get(source)!.sourceExcerptIds, ...nodeById.get(target)!.sourceExcerptIds])];
    map.edges.push({ id, source, target, label, kind, bidirectional: ["reinforces", "conflicts-with"].includes(kind),
      confidence: source.includes("money") ? "low" : "medium", sensitive: true, provenance: ["I"], sourceExcerptIds: excerpts });
  });
  const excerpts = await reviewedExcerpts();
  const sourceIds = new Set(map.sourceExcerpts.map((item) => item.id));
  map.sourceExcerpts.push(...excerpts.filter((item) => !sourceIds.has(item.id)));
  if (input.title === initialBeliefMap.title) map.title = "信念系统 · 对话证据架构";
  if (input.description === initialBeliefMap.description) map.description = "价值与资源、核心候选、条件规则、意识心聚焦、情境中的感受和应对反馈。结构关系是解释假设，非固定人格或单一因果模型。";
  map.updatedAt = REVIEW_DATE;
  return BeliefMapSchema.parse(map);
}

export function reviewCoverage(map: BeliefMap) {
  const reviewed = map.sourceExcerpts.filter((item) => item.id.startsWith("history-") || item.id.startsWith("current-belief-"));
  return {
    conversations: new Set(reviewed.map((item) => item.conversationId).filter(Boolean)).size,
    direct: reviewed.filter((item) => item.provenance === "U0").length,
    quoted: reviewed.filter((item) => item.provenance === "Q").length,
  };
}
