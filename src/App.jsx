import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  ArrowLeft,
  Download,
  RefreshCcw,
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
const qrVersion = 6;
const qrSize = qrVersion * 4 + 17;
const qrDataCodewords = 136;
const qrEccCodewordsPerBlock = 18;
const qrBlockCount = 2;

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

function appendBits(buffer, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    buffer.push((value >>> i) & 1);
  }
}

function getByteData(text) {
  return Array.from(new TextEncoder().encode(text));
}

function reedSolomonMultiply(x, y) {
  let result = 0;
  for (let i = 7; i >= 0; i -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((y >>> i) & 1) * x;
  }
  return result;
}

function reedSolomonDivisor(degree) {
  const result = Array(degree - 1).fill(0).concat(1);
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) {
        result[j] ^= result[j + 1];
      }
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = Array(divisor.length).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= reedSolomonMultiply(coefficient, factor);
    });
  });
  return result;
}

function createQrCodewords(text) {
  const data = getByteData(text);
  if (data.length > qrDataCodewords - 2) {
    throw new Error("QR content is too long");
  }

  const bits = [];
  appendBits(bits, 0x4, 4);
  appendBits(bits, data.length, 8);
  data.forEach((byte) => appendBits(bits, byte, 8));

  const capacityBits = qrDataCodewords * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    dataCodewords.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  }

  for (let pad = 0xec; dataCodewords.length < qrDataCodewords; pad ^= 0xfd) {
    dataCodewords.push(pad);
  }

  const divisor = reedSolomonDivisor(qrEccCodewordsPerBlock);
  const blockDataLength = qrDataCodewords / qrBlockCount;
  const blocks = [];
  for (let i = 0; i < qrBlockCount; i += 1) {
    const blockData = dataCodewords.slice(i * blockDataLength, (i + 1) * blockDataLength);
    blocks.push(blockData.concat(reedSolomonRemainder(blockData, divisor)));
  }

  const codewords = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block) => {
      codewords.push(block[i]);
    });
  }
  return codewords;
}

function createEmptyQrGrid() {
  return Array.from({ length: qrSize }, () => Array(qrSize).fill(false));
}

function createQrMatrix(value) {
  const modules = createEmptyQrGrid();
  const reserved = createEmptyQrGrid();

  const setFunction = (x, y, dark) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  const drawFinder = (x, y) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < qrSize && yy >= 0 && yy < qrSize) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          setFunction(xx, yy, distance !== 2 && distance !== 4);
        }
      }
    }
  };

  const drawAlignment = (x, y) => {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  for (let i = 0; i < qrSize; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  drawFinder(3, 3);
  drawFinder(qrSize - 4, 3);
  drawFinder(3, qrSize - 4);
  drawAlignment(6, 34);
  drawAlignment(34, 6);
  drawAlignment(34, 34);

  const drawFormatBits = () => {
    const formatData = (1 << 3) | 0;
    let remainder = formatData;
    for (let i = 0; i < 10; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }
    const bits = ((formatData << 10) | remainder) ^ 0x5412;
    const bit = (index) => ((bits >>> index) & 1) === 1;

    for (let i = 0; i <= 5; i += 1) setFunction(8, i, bit(i));
    setFunction(8, 7, bit(6));
    setFunction(8, 8, bit(7));
    setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) setFunction(qrSize - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) setFunction(8, qrSize - 15 + i, bit(i));
    setFunction(8, qrSize - 8, true);
  };

  drawFormatBits();

  const codewords = createQrCodewords(value);
  let bitIndex = 0;
  for (let right = qrSize - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < qrSize; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? qrSize - 1 - vert : vert;
        if (!reserved[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] = ((codewords[Math.floor(bitIndex / 8)] >>> (7 - (bitIndex % 8))) & 1) === 1;
          bitIndex += 1;
        }
      }
    }
  }

  for (let y = 0; y < qrSize; y += 1) {
    for (let x = 0; x < qrSize; x += 1) {
      if (!reserved[y][x] && (x + y) % 2 === 0) {
        modules[y][x] = !modules[y][x];
      }
    }
  }
  drawFormatBits();
  return modules;
}

function buildQrPath(matrix, quiet = 4) {
  return matrix
    .flatMap((row, y) =>
      row.map((dark, x) => (dark ? `M${x + quiet} ${y + quiet}h1v1H${x + quiet}z` : "")),
    )
    .filter(Boolean)
    .join("");
}

function getSiteUrl(typeCode) {
  const configuredUrl = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  const baseUrl = configuredUrl || new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString();
  const url = new URL(baseUrl, window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("from", "card");
  url.searchParams.set("p", typeCode);

  if (getByteData(url.toString()).length <= qrDataCodewords - 2) {
    return url.toString();
  }
  url.search = "";
  return url.toString();
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

function PersonaArtwork({ type, className = "" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = type?.image;

  if (image?.src && !imageFailed) {
    return (
      <div className={`persona-art ${className}`} style={{ "--accent": type.accent }}>
        <img src={image.src} alt={image.alt || `${type.name}榴莲人格图`} onError={() => setImageFailed(true)} />
      </div>
    );
  }

  return <DurianGlyph type={type} />;
}

function ShareQrCode({ value }) {
  const path = useMemo(() => buildQrPath(createQrMatrix(value)), [value]);
  const viewBoxSize = qrSize + 8;

  return (
    <svg viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} role="img" aria-label="扫码打开榴莲人格测试">
      <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
      <path d={path} fill="#141a14" shapeRendering="crispEdges" />
    </svg>
  );
}

function MysteryGlyph() {
  return (
    <div className="mystery-glyph">
      <span>?</span>
    </div>
  );
}

function Home({ onStart }) {
  return (
    <main className="home-grid">
      <section className="hero-panel">
        <h1>测测你的榴莲人格</h1>
        <div className="hero-visual">
          <MysteryGlyph />
          <div>
            <strong>你的榴莲人格是？</strong>
            <p>10 道题测出你的专属人格</p>
          </div>
        </div>
        <div className="hero-actions">
          <Button icon={Sparkles} onClick={onStart}>
            开始测试
          </Button>
        </div>
      </section>

      <aside className="cover-panel">
        <img src="/assets/generated-durian-card.jpg" alt="你的榴莲人格卡" />
      </aside>
    </main>
  );
}

function TestScreen({ answers, setAnswers, onResult, onHome }) {
  const [index, setIndex] = useState(0);
  const [advancing, setAdvancing] = useState(false);
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
    if (advancing) return;
    const nextAnswers = { ...answers, [question.id]: optionIndex };
    setAnswers(nextAnswers);
    setAdvancing(true);
    window.setTimeout(() => {
      if (index < questions.length - 1) {
        setIndex(index + 1);
        setAdvancing(false);
      } else {
        onResult(nextAnswers);
      }
    }, 180);
  };

  const goBack = () => {
    if (advancing) return;
    if (index > 0) {
      setIndex(index - 1);
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
              disabled={advancing}
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
        <Button icon={ArrowLeft} variant="secondary" disabled={index === 0 || advancing} onClick={goBack}>
          上一题
        </Button>
        <span>{advancing ? "正在进入下一题" : `${done} 个信号已记录`}</span>
      </div>
    </main>
  );
}

function ShareCard({ result, cardRef }) {
  const type = result.finalType;
  const shareUrl = getSiteUrl(type.code);
  return (
    <div className="share-card" ref={cardRef} style={{ "--fruit": type.color, "--accent": type.accent }}>
      <div className="share-head">
        <span>榴莲人格</span>
        <b>{type.code}</b>
      </div>
      <PersonaArtwork type={type} />
      <h2>{type.name}</h2>
      <p>{type.cardLine}</p>
      <div className="share-reco">
        <span>推荐</span>
        <strong>{type.variety}</strong>
      </div>
      <div className="share-bottom">
        <div className="mini-radar">
          {dimensionOrder.slice(0, 5).map((dim) => (
            <div key={dim}>
              <span>{dimensions[dim].name.slice(0, 2)}</span>
              <i style={{ height: `${result.scores[dim] * 26}%` }} />
            </div>
          ))}
        </div>
        <a className="real-qr" href={shareUrl} target="_blank" rel="noreferrer" aria-label="扫码打开榴莲人格测试">
          <ShareQrCode value={shareUrl} />
          <span>扫码测</span>
        </a>
      </div>
    </div>
  );
}

function ResultScreen({ result, onRestart }) {
  const cardRef = useRef(null);
  const [shareImage, setShareImage] = useState("");
  const [message, setMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const type = result.finalType;

  const generateShare = async () => {
    if (!cardRef.current || isGenerating) return;
    setIsGenerating(true);
    setMessage("正在生成分享卡...");
    try {
      const renderTask = toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#fff9db",
      });
      const timeoutTask = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("share render timeout")), 18000);
      });
      const dataUrl = await Promise.race([renderTask, timeoutTask]);
      setShareImage(dataUrl);
      const link = document.createElement("a");
      link.download = `${type.code}-durian-persona.png`;
      link.href = dataUrl;
      link.click();
      setMessage("分享卡已生成");
    } catch (error) {
      setMessage("分享卡生成失败，请稍后重试");
    } finally {
      setIsGenerating(false);
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
          <Button icon={Download} disabled={isGenerating} onClick={generateShare}>
            {isGenerating ? "生成中..." : "生成分享图"}
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

  const showResult = (finalAnswers = answers) => {
    const computed = computeResult(finalAnswers);
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
    />
  );
}
