"use client";

type SethReferenceProps = {
  domain?: string;
  kind?: string;
};

const source = {
  title: "2.The Nature of Personal Reality（个人实相的本质） .doc",
  url: "https://docs.google.com/document/d/1siiDhLzeLbLN0Q53vPYF5bx5BJsDYMfy/edit",
};

const chapters = [
  {
    number: 2,
    title: "实相与个人信念",
    original: "Reality and Personal Beliefs",
    cue: "信念如何参与形成个人经验。",
    match: ["belief", "core", "self"],
  },
  {
    number: 3,
    title: "暗示、心灵感应与信念的组合",
    original: "Suggestion, Telepathy, and the Grouping of Beliefs",
    cue: "单个信念如何与其他信念结成结构。",
    match: ["rule", "strategy", "relationship"],
  },
  {
    number: 4,
    title: "你的想象力、信念与信念来源",
    original: "Your Imagination and Your Beliefs",
    cue: "辨认信念的来源，以及想象如何为它供能。",
    match: ["source", "trigger", "body"],
  },
  {
    number: 6,
    title: "你的信念体与信念的力量结构",
    original: "The Body of Your Beliefs, and the Power Structures of Belief",
    cue: "观察哪些信念居于中心，哪些行为在持续加强它。",
    match: ["strategy", "behavior", "work"],
  },
  {
    number: 19,
    title: "能量、信念与当下的力量点",
    original: "The Concentration of Energy, Beliefs, and the Present Point of Power",
    cue: "从此刻的注意与选择开始，而不是等待完全掌控。",
    match: ["active", "situational", "meaning"],
  },
  {
    number: 22,
    title: "肯定、生活改善与信念的新结构",
    original: "Affirmation, the Practical Betterment of Your Life, and the New Structuring of Beliefs",
    cue: "把新信念当作可验证的选择，而不是压过恐惧的口号。",
    match: ["bridge", "emerging", "practice"],
  },
];

export function SethReference({ domain = "", kind = "" }: SethReferenceProps) {
  const key = `${domain} ${kind}`.toLowerCase();
  const ranked = [...chapters].sort((a, b) => {
    const score = (chapter: (typeof chapters)[number]) =>
      chapter.match.reduce((sum, word) => sum + (key.includes(word) ? 1 : 0), 0);
    return score(b) - score(a);
  });
  const selected = ranked[0];

  return (
    <section className="seth-reference" aria-labelledby="seth-reference-title">
      <div className="section-kicker" id="seth-reference-title">
        《个人实相的本质》· 章节导航
      </div>
      <div className="seth-chapter-number" aria-hidden="true">
        {String(selected.number).padStart(2, "0")}
      </div>
      <div>
        <strong>第 {selected.number} 章 · {selected.title}</strong>
        <p>{selected.cue}</p>
      </div>
      <p className="source-boundary">
        这是对照线索，不是对你的心理诊断，也不用来判定某条信念的真假。
      </p>
    </section>
  );
}

export function SethChapterIndex() {
  return (
    <div className="chapter-index">
      {chapters.map((chapter) => (
        <article key={chapter.number}>
          <span>{String(chapter.number).padStart(2, "0")}</span>
          <div>
            <strong>{chapter.title}</strong>
            <small>{chapter.original}</small>
            <p>{chapter.cue}</p>
          </div>
        </article>
      ))}
      <p className="source-boundary">
        目录已于 2026-08-13 对照 Google Drive 中的
        <a href={source.url} target="_blank" rel="noreferrer">《{source.title}》</a>
        核验。中文标题与提示是导航性翻译和摘要，不是逐字引文；页面不复制长段原文。
      </p>
    </div>
  );
}
