import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Download,
  Flame,
  RefreshCcw,
  Share2,
  Sparkles,
  Store,
} from "lucide-react";
import {
  darkDefects,
  dimensionOrder,
  dimensions,
  normalTypes,
  questions,
  seedLeads,
  typeLibrary,
} from "./data";
import "./styles.css";

const levelNum = { L: 1, M: 2, H: 3 };
const levelName = { L: "低", M: "中", H: "高" };
const homeHooks = [
  "先玩梗，再开果。先发卡，再成交。",
  "你不是在做测试，你在挑今晚的开果剧本。",
  "30 秒测完，拿到你的人格卡和第一颗推荐果。",
];
const loopFlow = [
  { title: "先玩", desc: "10 题榴莲人格测试，低门槛社交入口。" },
  { title: "再晒", desc: "生成分享卡，带来朋友测和拼团线索。" },
  { title: "后转化", desc: "商家拿到购买意愿、偏好和黑暗品接受度。" },
];
const coachNotes = [
  "先抓你的核心顾虑，后面的推荐会更稳。",
  "这题在判断你对榴莲气味的真实阈值。",
  "我们在收集你对口感的偏好，不存在标准答案。",
  "预算会直接影响推荐品种和购买形式。",
  "场景决定你是独享派、送礼派还是拼团派。",
  "这一题在判断你对黑暗品和非标果的接受度。",
  "你的决策触发点会映射到商家的话术策略。",
  "这里在看你的分享裂变潜力。",
  "信任需求决定你更看重售后还是信息透明。",
  "最后一步，确认你当前的购买意愿温度。",
];

function levelFromScore(score) {
  if (score < 1.75) return "L";
  if (score < 2.45) return "M";
  return "H";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parsePattern(pattern) {
  return pattern.split("");
}

function getSignalLabel(questionId, optionIndex) {
  const question = questions.find((item) => item.id === questionId);
  if (!question) return "";
  const option = question.options[optionIndex];
  if (!option) return "";
  const tags = option.tags || {};
  return (
    tags.scene ||
    tags.flavor ||
    tags.concern ||
    tags.trigger ||
    tags.darkIntent ||
    tags.share ||
    tags.buyStage ||
    tags.budgetText ||
    tags.trust ||
    option.label
  );
}

function emptyScores() {
  return dimensionOrder.reduce(
    (acc, dim) => {
      acc.totals[dim] = 0;
      acc.counts[dim] = 0;
      acc.scores[dim] = 2;
      acc.levels[dim] = "M";
      return acc;
    },
    { totals: {}, counts: {}, scores: {}, levels: {} },
  );
}

function computeResult(answers) {
  const state = emptyScores();
  const tags = {};
  const intentValues = [];
  let hiddenSignal = false;

  questions.forEach((question) => {
    const index = answers[question.id];
    if (index === undefined) return;
    const option = question.options[index];

    Object.entries(option.scores || {}).forEach(([dim, value]) => {
      state.totals[dim] += value;
      state.counts[dim] += 1;
    });

    Object.entries(option.tags || {}).forEach(([key, value]) => {
      tags[key] = value;
    });

    if (option.tags?.intent) intentValues.push(option.tags.intent);
    if (option.hiddenSignal === "crack") hiddenSignal = true;
  });

  dimensionOrder.forEach((dim) => {
    const score = state.counts[dim] ? state.totals[dim] / state.counts[dim] : 2;
    state.scores[dim] = Number(score.toFixed(2));
    state.levels[dim] = levelFromScore(score);
  });

  const userVector = dimensionOrder.map((dim) => levelNum[state.levels[dim]]);
  const ranked = normalTypes
    .map((type) => {
      const vector = parsePattern(type.pattern).map((level) => levelNum[level]);
      const distance = vector.reduce(
        (sum, value, index) => sum + Math.abs(value - userVector[index]),
        0,
      );
      const exact = vector.filter((value, index) => value === userVector[index]).length;
      const similarity = Math.round((1 - distance / (dimensionOrder.length * 2)) * 100);
      return { ...type, distance, exact, similarity };
    })
    .sort((a, b) => a.distance - b.distance || b.exact - a.exact);

  const crackTriggered =
    hiddenSignal && state.scores.dark >= 2.55 && state.scores.risk >= 2.25;

  let finalType = crackTriggered ? typeLibrary["CRACK-M"] : ranked[0];
  let mode = crackTriggered ? "隐藏人格已激活" : "你的榴莲人格";

  if (!crackTriggered && ranked[0].similarity < 58) {
    finalType = typeLibrary["ABSTRACT-H"];
    mode = "系统兜底人格";
  }

  const rawIntent =
    intentValues.reduce((sum, value) => sum + value, 0) / Math.max(intentValues.length, 1);
  const socialBoost = state.levels.social === "H" ? 0.35 : 0;
  const darkBoost = finalType.code === "CRACK-M" ? 0.35 : 0;
  const intentScore = Number(clamp(rawIntent + socialBoost + darkBoost, 1, 5).toFixed(1));
  const match = finalType.fallback ? ranked[0].similarity : crackTriggered ? 100 : ranked[0].similarity;

  return {
    ...state,
    tags,
    ranked,
    finalType,
    mode,
    match,
    intentScore,
    lead: {
      type: finalType.code,
      intent: intentScore,
      share: state.scores.social,
      dark: state.scores.dark,
      variety: finalType.variety,
      scene: tags.scene || "测试结果",
    },
  };
}

function buildDarkCard(result, defectId) {
  const defect = darkDefects.find((item) => item.id === defectId) || darkDefects[0];
  const type = result?.finalType || typeLibrary["CRACK-M"];

  return {
    title: defect.name,
    badge: `${defect.label} / ${type.variety}`,
    fit: type.code === "CRACK-M" ? "裂口发疯人专属果" : `${type.name}可尝试款`,
    risk: defect.risk,
    upside: defect.upside,
    copy: `我有点${defect.label}，但缺点明说、价格够香，适合今晚开吃。`,
    live: `这颗${defect.label}比较明显，所以不适合送礼；但如果你是自吃党，今天开，性价比很能打。`,
  };
}

function Button({ children, icon: Icon, variant = "primary", ...props }) {
  return (
    <button className={`btn btn-${variant}`} {...props}>
      {Icon ? <Icon size={18} strokeWidth={2.4} /> : null}
      <span>{children}</span>
    </button>
  );
}

function DurianGlyph({ type }) {
  const color = type?.color || "#ffd43b";
  const accent = type?.accent || "#2f9e44";
  return (
    <div className="durian-glyph" style={{ "--fruit": color, "--accent": accent }}>
      <div className="durian-shell">
        <span />
        <span />
        <span />
      </div>
      <div className="durian-face">
        <i />
        <i />
      </div>
    </div>
  );
}

function Home({ onStart, onDashboard, onDemo }) {
  const hook = homeHooks[new Date().getDate() % homeHooks.length];
  const teaserTypes = ["GOLD-I", "GROUP-E", "CRACK-M"].map(
    (typeCode) => typeLibrary[typeCode],
  );

  return (
    <main className="home-grid">
      <section className="hero-panel">
        <div className="eyebrow">
          <Sparkles size={16} />
          SBTI 热点玩法 · 榴莲导购闭环
        </div>
        <h1>测测你的榴莲 SBTI</h1>
        <p className="hero-copy">
          先用人格测试把人留下来，再把结果变成推荐、分享和成交。前台负责趣味参与，后台沉淀购买线索。
        </p>
        <p className="hero-hook">{hook}</p>
        <div className="hero-actions">
          <Button icon={Sparkles} onClick={onStart}>
            开始测试
          </Button>
          <Button icon={Share2} variant="ghost" onClick={onDemo}>
            先看示例结果
          </Button>
          <Button icon={BarChart3} variant="secondary" onClick={onDashboard}>
            商家看板
          </Button>
        </div>
        <div className="guide-strip">
          {loopFlow.map((item) => (
            <div className="guide-step" key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="loop-strip" aria-label="商业闭环">
          {["社交入口", "人格测试", "AI推荐", "分享裂变", "商家转化"].map((item) => (
            <div className="loop-step" key={item}>
              {item}
            </div>
          ))}
        </div>
        <div className="persona-strip">
          {teaserTypes.map((type) => (
            <div className="persona-chip" key={type.code}>
              <b>{type.name}</b>
              <span>{type.cardLine}</span>
            </div>
          ))}
        </div>
      </section>

      <aside className="cover-panel">
        <img src="/assets/generated-durian-card.jpg" alt="榴莲人格导购官主视觉" />
        <div className="cover-caption">
          <strong>答辩表达收束</strong>
          <span>低成本入口带来测试数据，测试数据沉淀为购买线索，购买线索反哺直播话术和黑暗品转化。</span>
        </div>
      </aside>
    </main>
  );
}

function TestScreen({ answers, setAnswers, onResult, onHome }) {
  const [index, setIndex] = useState(0);
  const question = questions[index];
  const selected = answers[question.id];
  const done = Object.keys(answers).length;
  const percent = ((index + 1) / questions.length) * 100;
  const remaining = questions.length - index - 1;
  const signals = Object.entries(answers)
    .map(([questionId, optionIndex]) => getSignalLabel(questionId, optionIndex))
    .filter(Boolean)
    .slice(-4);

  const choose = (optionIndex) => {
    setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }));
  };

  const goNext = () => {
    if (index < questions.length - 1) {
      setIndex(index + 1);
    } else {
      onResult();
    }
  };

  return (
    <main className="test-panel">
      <div className="topline">
        <Button icon={ArrowLeft} variant="ghost" onClick={onHome}>
          首页
        </Button>
        <div className="progress-wrap">
          <div className="progress-meta">
            <span>{question.intentLabel}</span>
            <b>
              {index + 1}/{questions.length}
            </b>
          </div>
          <div className="progress-track">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
      <div className="coach-strip">
        <span>导购教练</span>
        <p>{coachNotes[index]}</p>
        <b>{remaining === 0 ? "答完这一题就开果" : `再答 ${remaining} 题就能出结果`}</b>
      </div>

      <section className="question-card">
        <div className="question-kicker">榴莲 SBTI 第 {index + 1} 题</div>
        <h2>{question.title}</h2>
        <div className="option-list">
          {question.options.map((option, optionIndex) => (
            <button
              className={`option-row ${selected === optionIndex ? "selected" : ""}`}
              key={option.label}
              onClick={() => choose(optionIndex)}
            >
              <span>{String.fromCharCode(65 + optionIndex)}</span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
      </section>
      {signals.length ? (
        <div className="signal-strip" aria-label="已收集信号">
          <span>已收集信号</span>
          <div>
            {signals.map((signal) => (
              <i key={signal}>{signal}</i>
            ))}
          </div>
        </div>
      ) : null}

      <div className="bottom-nav">
        <Button
          icon={ArrowLeft}
          variant="secondary"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          上一题
        </Button>
        <span>{done} 个信号已记录</span>
        <Button icon={index === questions.length - 1 ? BadgeCheck : ArrowRight} disabled={selected === undefined} onClick={goNext}>
          {index === questions.length - 1 ? "查看结果" : "下一题"}
        </Button>
      </div>
    </main>
  );
}

function ShareCard({ result, cardRef }) {
  const type = result.finalType;
  return (
    <div className="share-card" ref={cardRef} style={{ "--fruit": type.color, "--accent": type.accent }}>
      <div className="share-head">
        <span>榴莲 SBTI</span>
        <b>{type.code}</b>
      </div>
      <DurianGlyph type={type} />
      <h2>{type.name}</h2>
      <p>{type.cardLine}</p>
      <div className="share-reco">
        <span>推荐</span>
        <strong>{type.variety}</strong>
      </div>
      <div className="mini-radar">
        {dimensionOrder.slice(0, 5).map((dim) => (
          <div key={dim}>
            <span>{dimensions[dim].name.slice(0, 2)}</span>
            <i style={{ height: `${result.scores[dim] * 26}%` }} />
          </div>
        ))}
      </div>
      <div className="fake-qr" aria-hidden="true">
        {Array.from({ length: 36 }).map((_, itemIndex) => (
          <i key={itemIndex} className={(itemIndex * 7 + type.code.length) % 3 === 0 ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

function ResultScreen({ result, onRestart, onDashboard, onDark }) {
  const cardRef = useRef(null);
  const [shareImage, setShareImage] = useState("");
  const [message, setMessage] = useState("");
  const type = result.finalType;

  const generateShare = async () => {
    if (!cardRef.current) return;
    setMessage("正在生成分享卡...");
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#fff9db",
      });
      setShareImage(dataUrl);
      const link = document.createElement("a");
      link.download = `${type.code}-durian-sbti.png`;
      link.href = dataUrl;
      link.click();
      setMessage("分享卡已生成");
    } catch (error) {
      setMessage("分享卡生成失败，请稍后重试");
    }
  };

  return (
    <main className="result-grid">
      <section className="result-main">
        <div className="result-label">{result.mode}</div>
        <div className="result-title-row">
          <div>
            <h1>{type.name}</h1>
            <p>{type.cardLine}</p>
          </div>
          <div className="match-pill">匹配度 {result.match}%</div>
        </div>
        <p className="result-bridge">
          玩梗不是终点，闭环才是重点：先晒卡裂变，再承接购买，再把偏好数据反哺商家选品。
        </p>

        <div className="recommend-grid">
          <div className="recommend-block">
            <span>推荐品种</span>
            <strong>{type.variety}</strong>
            <p>{type.desc}</p>
          </div>
          <div className="recommend-block">
            <span>购买形式</span>
            <strong>{type.form}</strong>
            <p>{type.avoid}</p>
          </div>
          <div className="recommend-block hot">
            <span>商家信号</span>
            <strong>{result.intentScore}/5 购买意愿</strong>
            <p>{type.merchantSignal}</p>
          </div>
        </div>

        <section className="dimension-grid">
          {dimensionOrder.map((dim) => (
            <div className="dimension-item" key={dim}>
              <div>
                <span>{dimensions[dim].name}</span>
                <b>{levelName[result.levels[dim]]}</b>
              </div>
              <div className="bar">
                <i style={{ width: `${(result.scores[dim] / 3) * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
        <section className="action-rail">
          <h3>30 秒行动路径</h3>
          <div>
            <p>
              <b>1.</b> 先生成分享图，把你的 {type.name} 发到群里拉人进测试。
            </p>
            <p>
              <b>2.</b> 再看商家看板，确认高意愿人群和主推品种。
            </p>
            <p>
              <b>3.</b> 最后打开黑暗品名片，把非标果讲清楚并转化。
            </p>
          </div>
        </section>

        <div className="result-actions">
          <Button icon={Download} onClick={generateShare}>
            生成分享图
          </Button>
          <Button icon={Flame} variant="secondary" onClick={onDark}>
            黑暗品名片
          </Button>
          <Button icon={Store} variant="secondary" onClick={onDashboard}>
            商家看板
          </Button>
          <Button icon={RefreshCcw} variant="ghost" onClick={onRestart}>
            重测
          </Button>
        </div>
        {message ? <div className="toast">{message}</div> : null}
      </section>

      <aside className="share-side">
        <ShareCard result={result} cardRef={cardRef} />
        {shareImage ? (
          <a className="share-preview" href={shareImage} target="_blank" rel="noreferrer">
            查看已生成卡片
          </a>
        ) : null}
      </aside>
    </main>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{sub}</p>
    </div>
  );
}

function MerchantDashboard({ result, onHome, onDark }) {
  const leads = useMemo(() => {
    return result ? [...seedLeads, result.lead] : seedLeads;
  }, [result]);

  const total = leads.length;
  const highIntent = leads.filter((lead) => lead.intent >= 4).length;
  const highShare = leads.filter((lead) => lead.share >= 2.5).length;
  const highDark = leads.filter((lead) => lead.dark >= 2.5).length;
  const typeCounts = leads.reduce((acc, lead) => {
    const type = typeLibrary[lead.type] || typeLibrary["ABSTRACT-H"];
    acc[type.name] = (acc[type.name] || 0) + 1;
    return acc;
  }, {});
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topVariety = leads.reduce((acc, lead) => {
    acc[lead.variety] = (acc[lead.variety] || 0) + 1;
    return acc;
  }, {});
  const bestVariety = Object.entries(topVariety).sort((a, b) => b[1] - a[1])[0]?.[0] || "泰国金枕";

  const suggestionType = result?.finalType || typeLibrary["GOLD-I"];

  return (
    <main className="dashboard">
      <div className="dashboard-head">
        <div>
          <div className="eyebrow">
            <Store size={16} />
            商家后台 Demo
          </div>
          <h1>把测试热闹变成购买线索</h1>
        </div>
        <div className="dashboard-actions">
          <Button icon={ArrowLeft} variant="secondary" onClick={onHome}>
            回首页
          </Button>
          <Button icon={Flame} onClick={onDark}>
            生成黑暗品名片
          </Button>
        </div>
      </div>
      <section className="loop-banner" aria-label="商业闭环说明">
        <b>低成本社交入口 → 人格卡裂变 → 购买线索沉淀 → 直播与私域转化</b>
        <p>
          当前样本 <strong>{total}</strong> 人，系统已把“好玩测试”收束成可执行的选品和话术建议。
        </p>
      </section>

      <section className="metrics-grid">
        <Metric label="测试人数" value={total} sub="含当前演示用户" />
        <Metric label="高购买意愿" value={`${Math.round((highIntent / total) * 100)}%`} sub="可进入直播/社群承接" />
        <Metric label="分享裂变潜力" value={`${Math.round((highShare / total) * 100)}%`} sub="适合推人格卡和拼团" />
        <Metric label="黑暗品接受度" value={`${Math.round((highDark / total) * 100)}%`} sub="可转化非标库存" />
      </section>

      <section className="dash-grid">
        <div className="dash-panel">
          <h2>人格分布</h2>
          <div className="rank-list">
            {topTypes.map(([name, count]) => (
              <div className="rank-row" key={name}>
                <span>{name}</span>
                <div className="rank-bar">
                  <i style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="dash-panel suggestion">
          <h2>今日运营建议</h2>
          <p>
            当前最适合主推 <b>{bestVariety}</b>。新手和拼团用户占比较高，先用人格卡做低成本裂变，再用包熟、出肉率和直播讲解承接购买信任。
          </p>
          <p>
            黑暗品接受用户需要透明风险说明，适合用“数字名片”把瑕疵、适合人群和当天食用建议一次讲清。
          </p>
        </div>

        <div className="dash-panel script-panel">
          <h2>直播话术</h2>
          <div className="script-card">
            <span>开场</span>
            <p>{suggestionType.liveHook}</p>
          </div>
          <div className="script-card">
            <span>弹幕回复</span>
            <p>怕臭、怕夹生的朋友先选低风险款；想捡漏的朋友看黑暗品名片，缺点我们直接写明。</p>
          </div>
          <div className="script-card">
            <span>促单</span>
            <p>测完是同一人格的朋友可以一起拼，今晚开果，明天就不用继续云吃。</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function DarkProduct({ result, onBack, onDashboard }) {
  const [defect, setDefect] = useState("crack");
  const darkCard = buildDarkCard(result, defect);
  const type = result?.finalType || typeLibrary["CRACK-M"];

  return (
    <main className="dark-page">
      <div className="dashboard-head">
        <div>
          <div className="eyebrow">
            <Flame size={16} />
            黑暗品数字名片
          </div>
          <h1>把非标果从“卖相差”转成“讲得清”</h1>
        </div>
        <div className="dashboard-actions">
          <Button icon={ArrowLeft} variant="secondary" onClick={onBack}>
            回结果
          </Button>
          <Button icon={BarChart3} onClick={onDashboard}>
            看商家数据
          </Button>
        </div>
      </div>

      <section className="dark-layout">
        <div className="dark-controls">
          <h2>选择瑕疵类型</h2>
          <div className="segmented">
            {darkDefects.map((item) => (
              <button
                className={defect === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setDefect(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="copy-box">
            <span>直播间可用</span>
            <p>{darkCard.live}</p>
          </div>
          <div className="copy-box">
            <span>用户匹配</span>
            <p>{type.name} · {type.merchantSignal}</p>
          </div>
        </div>

        <article className="dark-card" style={{ "--fruit": type.color, "--accent": type.accent }}>
          <div className="dark-card-top">
            <span>{darkCard.badge}</span>
            <b>非标透明说明</b>
          </div>
          <DurianGlyph type={type} />
          <h2>{darkCard.title}</h2>
          <p className="fit">{darkCard.fit}</p>
          <div className="dark-info">
            <div>
              <span>缺点</span>
              <p>{darkCard.risk}</p>
            </div>
            <div>
              <span>优点</span>
              <p>{darkCard.upside}</p>
            </div>
          </div>
          <blockquote>{darkCard.copy}</blockquote>
        </article>
      </section>
    </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  const start = () => {
    setAnswers({});
    setResult(null);
    setScreen("test");
  };

  const showResult = () => {
    const computed = computeResult(answers);
    setResult(computed);
    setScreen("result");
  };

  const showDemoResult = () => {
    const demoAnswers = {
      fear: 0,
      smell: 1,
      taste: 0,
      budget: 1,
      scene: 0,
      dark: 1,
      decision: 1,
      share: 2,
      afterSale: 0,
      buyNow: 2,
    };
    const computed = computeResult(demoAnswers);
    setAnswers(demoAnswers);
    setResult(computed);
    setScreen("result");
  };

  if (screen === "test") {
    return (
      <TestScreen
        answers={answers}
        setAnswers={setAnswers}
        onResult={showResult}
        onHome={() => setScreen("home")}
      />
    );
  }

  if (screen === "result" && result) {
    return (
      <ResultScreen
        result={result}
        onRestart={start}
        onDashboard={() => setScreen("dashboard")}
        onDark={() => setScreen("dark")}
      />
    );
  }

  if (screen === "dashboard") {
    return (
      <MerchantDashboard
        result={result}
        onHome={() => setScreen("home")}
        onDark={() => setScreen("dark")}
      />
    );
  }

  if (screen === "dark") {
    return (
      <DarkProduct
        result={result}
        onBack={() => setScreen(result ? "result" : "home")}
        onDashboard={() => setScreen("dashboard")}
      />
    );
  }

  return (
    <Home
      onStart={start}
      onDemo={showDemoResult}
      onDashboard={() => setScreen("dashboard")}
    />
  );
}
