import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Download,
  RefreshCcw,
  Share2,
  Sparkles,
} from "lucide-react";
import {
  darkDefects,
  dimensionOrder,
  dimensions,
  normalTypes,
  questions,
  typeLibrary,
} from "./data";
import "./styles.css";

const levelNum = { L: 1, M: 2, H: 3 };
const levelName = { L: "低", M: "中", H: "高" };

const homeHooks = [
  "你吃榴莲的样子，出卖了你的人格。",
  "30 秒测出你是哪种榴莲人格，拿专属推荐品种。",
  "测完还有人格卡可以发，今晚就开果。",
];

const loopFlow = [
  { title: "测", desc: "10 道趣味题，测出你的榴莲人格类型。" },
  { title: "看", desc: "拿到专属品种推荐和开果攻略。" },
  { title: "晒", desc: "生成人格卡，分享给朋友一起玩。" },
];

const coachNotes = [
  "先抓你的核心顾虑，后面的推荐会更准。",
  "这题在判断你对榴莲气味的真实接受度。",
  "我们在收集你对口感的偏好，不存在标准答案。",
  "预算会直接影响推荐品种和购买形式。",
  "场景决定你是独享派、送礼派还是拼团派。",
  "这一题在判断你对非标准外观榴莲的接受度。",
  "你最容易被什么打动，后面推荐会参考这个。",
  "这题看看你愿不愿意把结果分享出去。",
  "信任需求决定你更看重售后还是信息透明。",
  "最后一步，确认你当前的开果意愿。",
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
    mode = "榴莲抽象派";
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

function Home({ onStart, onDemo }) {
  const hook = homeHooks[new Date().getDate() % homeHooks.length];
  const teaserTypes = ["GOLD-I", "GROUP-E", "CRACK-M"].map(
    (typeCode) => typeLibrary[typeCode],
  );

  return (
    <main className="home-grid">
      <section className="hero-panel">
        <div className="eyebrow">
          <Sparkles size={16} />
          榴莲人格测试 · 测完就懂吃
        </div>
        <h1>测测你的榴莲人格</h1>
        <p className="hero-copy">
          10 道题测出你的榴莲口味人格，拿到专属品种推荐，生成人格卡分享给朋友。
        </p>
        <p className="hero-hook">{hook}</p>
        <div className="hero-actions">
          <Button icon={Sparkles} onClick={onStart}>
            开始测试
          </Button>
          <Button icon={Share2} variant="ghost" onClick={onDemo}>
            先看示例结果
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
        <img src="/assets/generated-durian-card.jpg" alt="你的榴莲人格卡" />
        <div className="cover-caption">
          <strong>你的榴莲人格卡</strong>
          <span>测完就能生成专属人格卡，保存图片发朋友圈，看看朋友们都是什么人格。</span>
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
        <span>榴莲教练</span>
        <p>{coachNotes[index]}</p>
        <b>{remaining === 0 ? "答完这一题就出结果" : `再答 ${remaining} 题就能出结果`}</b>
      </div>

      <section className="question-card">
        <div className="question-kicker">榴莲人格测试 第 {index + 1} 题</div>
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
        <span>榴莲人格</span>
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

function ResultScreen({ result, onRestart }) {
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
      link.download = `${type.code}-durian-persona.png`;
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

        <div className="recommend-grid">
          <div className="recommend-block">
            <span>推荐品种</span>
            <strong>{type.variety}</strong>
            <p>{type.desc}</p>
          </div>
          <div className="recommend-block">
            <span>推荐形式</span>
            <strong>{type.form}</strong>
            <p>{type.avoid}</p>
          </div>
          <div className="recommend-block hot">
            <span>开果指数</span>
            <strong>{result.intentScore}/5</strong>
            <p>你当前的开果意愿强度，越高说明你越准备好今晚就吃。</p>
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
          <h3>接下来你可以</h3>
          <div>
            <p>
              <b>1.</b> 生成分享图，把你的「{type.name}」人格卡发到群里，拉朋友一起测。
            </p>
            <p>
              <b>2.</b> 按推荐品种去买，{type.variety} 最适合你。
            </p>
            <p>
              <b>3.</b> 觉得不准？重测一次试试。
            </p>
          </div>
        </section>

        <div className="result-actions">
          <Button icon={Download} onClick={generateShare}>
            生成分享图
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
      />
    );
  }

  return (
    <Home
      onStart={start}
      onDemo={showDemoResult}
    />
  );
}
