const COLORS = {
  ink: "#16235A",
  blue: "#45B9F4",
  deepBlue: "#2457D6",
  purple: "#8B4DE8",
  pink: "#F04DB3",
  green: "#25B66B",
  orange: "#FF9F1C",
  yellow: "#FFD84D",
  red: "#F05252",
  mint: "#DFF9EA",
  sky: "#DFF5FF",
  cream: "#FFF8E8",
  white: "#FFFFFF",
  line: "#B8DDF3",
};

const slides = [
  { n: 1, type: "cover", title: "Yapay Zeka", subtitle: "Robotlar gerçekten düşünebilir mi?" },
  { n: 2, type: "agenda", title: "Bugün Neler Öğreneceğiz?", bullets: ["Yapay zeka nedir?", "Nerelerde kullanılır?", "Nasıl öğrenir?", "Birlikte oyun oynayacağız!"] },
  { n: 3, type: "cards", title: "Sizce Bunların İçinde Yapay Zeka Var mı?", cards: [["Telefon", "smartphone"], ["Oyun", "gamepad-2"], ["Araba", "car"], ["YouTube", "youtube"]] },
  { n: 4, type: "explain", title: "Yapay Zeka Nedir?", body: "Yapay zeka, bilgisayarların öğrenmesine yardımcı olan akıllı teknolojidir.\n\nİnsanlar gibi düşünmeye ve sorun çözmeye çalışır." },
  { n: 5, type: "bulletsArt", title: "Biz Nasıl Öğreniyoruz?", bullets: ["Bebekler her gün öğrenir.", "Görerek öğreniriz.", "Deneyerek öğreniriz."], art: "bike" },
  { n: 6, type: "process", title: "Yapay Zeka Nasıl Öğreniyor?", steps: [["1", "Örnek görür"], ["2", "Hata yapar"], ["3", "Tekrar dener"], ["4", "Daha iyi olur"]] },
  { n: 7, type: "choice", title: "Oyun Başlıyor!", subtitle: "Kedi mi? Köpek mi?", choices: [["Kedi", "cat"], ["Köpek", "dog"]] },
  { n: 8, type: "celebrate", title: "Harika!", body: "Az önce siz de bir yapay zeka gibi öğrendiniz!" },
  { n: 9, type: "usecase", title: "Telefonlarda Yapay Zeka", bullets: ["Yüzümüzü tanıyabilir.", "Sesimizi anlayabilir.", "Fotoğrafları düzenleyebilir."], icon: "smartphone" },
  { n: 10, type: "usecase", title: "Oyunlarda Yapay Zeka", bullets: ["Rakip olabilir.", "Yardımcı olabilir.", "Yeni dünyalar oluşturabilir."], icon: "gamepad-2" },
  { n: 11, type: "usecase", title: "Hastanelerde Yapay Zeka", bullets: ["Doktorlara yardım eder.", "Hastalıkları daha hızlı bulmaya yardımcı olur."], icon: "stethoscope" },
  { n: 12, type: "usecase", title: "Arabada Yapay Zeka", bullets: ["Trafik işaretlerini tanıyabilir.", "Yolu takip edebilir.", "Sürücüye yardım eder."], icon: "car" },
  { n: 13, type: "goodbad", title: "Yapay Zeka Çok İyi Neleri Yapar?", good: true, bullets: ["Çok hızlı hesaplama yapar.", "Çok fazla bilgiyi hatırlar.", "Resimleri tanıyabilir."] },
  { n: 14, type: "goodbad", title: "Yapay Zeka Neleri Yapamaz?", good: false, bullets: ["Üzülemez.", "Mutlu olamaz.", "Gerçek arkadaş olamaz."] },
  { n: 15, type: "people", title: "İnsanların Süper Gücü", bullets: ["Sevgi", "Dostluk", "Hayal gücü", "Yardımlaşma"] },
  { n: 16, type: "question", title: "Oyun 2", subtitle: "İnsan mı?\nYapay Zeka mı?" },
  { n: 17, type: "quizOne", title: "Soru 1", question: "2 + 2 kaç eder?", answer: "Yapay zeka da bilir, insan da bilir." },
  { n: 18, type: "quizOne", title: "Soru 2", question: "Arkadaşın üzgünse ona ne söylersin?", answer: "İnsanlar bu konuda daha iyidir." },
  { n: 19, type: "imagine", title: "Hayal Edelim!", body: "Pembe gözlüklü uçan bir fil!" },
  { n: 20, type: "future", title: "Gelecekte Yapay Zeka", bullets: ["Uzayda çalışabilir.", "Doktorlara yardım edebilir.", "Denizleri temizleyebilir."] },
  { n: 21, type: "prompt", title: "Siz Olsaydınız?", body: "Bir yapay zeka yapacak olsaydınız, ne yapmasını isterdiniz?", foot: "Fikirlerinizi paylaşın!" },
  { n: 22, type: "miniQuiz", title: "Mini Quiz", bullets: ["Yapay zeka öğrenebilir mi?", "Yapay zeka üzülebilir mi?", "Yapay zeka oyun oynayabilir mi?"] },
  { n: 23, type: "remember", title: "Unutmayalım!", body: "Yapay zeka bir araçtır.\nOnu kullanan insanlar önemlidir." },
  { n: 24, type: "futureKids", title: "Belki Geleceğin\nMühendisi Sensin!" },
  { n: 25, type: "thanks", title: "Teşekkürler!", subtitle: "Sorusu olan var mı?" },
];

let CTX;
const U = 96;

function px(value) {
  return value * U;
}

function fill(color) {
  return { type: "solid", color };
}

function line(color = COLORS.line, width = 1) {
  return CTX.line(color, width);
}

function add(slide, shape, x, y, w, h, opts = {}) {
  const { rectRadius, shadow, transparency, adjustPoint, ...clean } = opts;
  if (clean.line && clean.line.color && !clean.line.style) {
    clean.line = CTX.line(clean.line.color, 0);
  }
  return CTX.addShape(slide, {
    geometry: shape,
    x: px(x),
    y: px(y),
    width: px(w),
    height: px(h),
    ...clean,
  });
}

function text(slide, value, x, y, w, h, opts = {}) {
  const {
    fontFace,
    fontSize = 24,
    bold = false,
    color = COLORS.ink,
    align = "left",
    valign = "mid",
    margin,
    breakLine,
    fit,
    ...clean
  } = opts;
  return CTX.addText(slide, {
    text: value,
    x: px(x),
    y: px(y),
    width: px(w),
    height: px(h),
    fontSize,
    bold,
    color,
    align,
    valign,
    typeface: fontFace || "Arial",
    insets: { left: px(margin ?? 0.08), right: px(margin ?? 0.08), top: 0, bottom: 0 },
    ...clean,
  });
}

function iconText(slide, value, x, y, size, color = COLORS.deepBlue) {
  text(slide, value, x, y, size, size, { fontSize: size * 18, align: "center", color, bold: true, margin: 0 });
}

function bg(slide, accent = COLORS.blue) {
  add(slide, "rect", 0, 0, 13.333, 7.5, { fill: fill(COLORS.sky), line: fill(COLORS.sky) });
  add(slide, "rect", 0, 6.85, 13.333, 0.65, { fill: fill("#C8F0FF"), line: fill("#C8F0FF") });
  for (const c of [[1.2, 0.55, 1.7], [2.4, 0.82, 1.2], [9.7, 0.5, 1.5], [11.0, 0.85, 1.15]]) {
    add(slide, "ellipse", c[0], c[1], c[2], c[2] * 0.46, { fill: fill("#FFFFFF"), line: fill("#FFFFFF"), transparency: 15 });
  }
  for (const s of [[1.1, 5.7], [4.1, 0.6], [8.9, 1.1], [11.8, 5.4], [6.4, 6.2]]) {
    star(slide, s[0], s[1], 0.18, COLORS.yellow);
  }
  add(slide, "rect", 0, 0, 0.18, 7.5, { fill: fill(accent), line: fill(accent) });
}

function numberBadge(slide, n, color = COLORS.deepBlue) {
  add(slide, "ellipse", 0.35, 0.33, 0.68, 0.68, { fill: fill(color), line: fill(color) });
  text(slide, String(n), 0.35, 0.33, 0.68, 0.68, { color: COLORS.white, bold: true, fontSize: 24, align: "center", margin: 0 });
}

function title(slide, value, n, color = COLORS.deepBlue) {
  numberBadge(slide, n, color);
  text(slide, value, 1.2, 0.35, 10.9, 0.92, { fontSize: 30, bold: true, align: "center", color: n === 1 ? COLORS.purple : COLORS.ink, margin: 0.02 });
}

function card(slide, x, y, w, h, color = COLORS.white) {
  add(slide, "roundRect", x, y, w, h, { rectRadius: 0.08, fill: fill(color), line: line("#BFDFF1", 1.1), shadow: { type: "outer", opacity: 0.14, blur: 1, angle: 45, distance: 1 } });
}

function star(slide, x, y, r = 0.18, color = COLORS.yellow) {
  add(slide, "star5", x - r / 2, y - r / 2, r, r, { fill: fill(color), line: fill(color) });
}

function robot(slide, x, y, scale = 1, pose = "wave") {
  const s = scale;
  add(slide, "roundRect", x + 0.35*s, y, 1.5*s, 1.1*s, { fill: fill("#F8FDFF"), line: line("#57BDEB", 2) });
  add(slide, "roundRect", x + 0.55*s, y + 0.24*s, 1.1*s, 0.52*s, { fill: fill("#101A3C"), line: line("#101A3C", 1) });
  add(slide, "ellipse", x + 0.78*s, y + 0.39*s, 0.16*s, 0.16*s, { fill: fill("#54E5FF"), line: fill("#54E5FF") });
  add(slide, "ellipse", x + 1.26*s, y + 0.39*s, 0.16*s, 0.16*s, { fill: fill("#54E5FF"), line: fill("#54E5FF") });
  text(slide, "⌣", x + 0.92*s, y + 0.45*s, 0.38*s, 0.22*s, { fontSize: 12*s, bold: true, color: "#54E5FF", align: "center", margin: 0 });
  add(slide, "line", x + 1.1*s, y - 0.22*s, 0, 0.24*s, { line: line("#2457D6", 2) });
  add(slide, "ellipse", x + 1.02*s, y - 0.34*s, 0.18*s, 0.18*s, { fill: fill("#57BDEB"), line: fill("#2457D6") });
  add(slide, "roundRect", x + 0.58*s, y + 1.1*s, 1.05*s, 1.0*s, { fill: fill("#F8FDFF"), line: line("#57BDEB", 2) });
  add(slide, "roundRect", x + 0.88*s, y + 1.35*s, 0.45*s, 0.42*s, { fill: fill("#E7FAFF"), line: line("#8DDDF5", 1) });
  add(slide, "line", x + 0.62*s, y + 1.24*s, -0.44*s, 0.38*s, { line: line("#2457D6", 3) });
  add(slide, "line", x + 1.55*s, y + 1.24*s, pose === "wave" ? 0.56*s : 0.44*s, pose === "wave" ? -0.48*s : 0.38*s, { line: line("#2457D6", 3) });
  add(slide, "ellipse", x + 0.1*s, y + 1.55*s, 0.26*s, 0.26*s, { fill: fill("#F8FDFF"), line: line("#2457D6", 2) });
  add(slide, "ellipse", x + (pose === "wave" ? 2.02 : 1.9)*s, y + (pose === "wave" ? 0.66 : 1.55)*s, 0.28*s, 0.28*s, { fill: fill("#F8FDFF"), line: line("#2457D6", 2) });
  add(slide, "line", x + 0.82*s, y + 2.1*s, -0.12*s, 0.5*s, { line: line("#2457D6", 3) });
  add(slide, "line", x + 1.36*s, y + 2.1*s, 0.12*s, 0.5*s, { line: line("#2457D6", 3) });
}

function child(slide, x, y, scale = 1, shirt = COLORS.green, hair = "#6B3A21") {
  const s = scale;
  add(slide, "ellipse", x + 0.35*s, y, 0.86*s, 0.86*s, { fill: fill("#FFD2A6"), line: line("#E4A06B", 1) });
  add(slide, "arc", x + 0.35*s, y - 0.08*s, 0.86*s, 0.52*s, { fill: fill(hair), line: fill(hair) });
  add(slide, "ellipse", x + 0.6*s, y + 0.34*s, 0.08*s, 0.08*s, { fill: fill(COLORS.ink), line: fill(COLORS.ink) });
  add(slide, "ellipse", x + 0.91*s, y + 0.34*s, 0.08*s, 0.08*s, { fill: fill(COLORS.ink), line: fill(COLORS.ink) });
  text(slide, "⌣", x + 0.68*s, y + 0.42*s, 0.24*s, 0.18*s, { fontSize: 8*s, bold: true, color: COLORS.red, align: "center", margin: 0 });
  add(slide, "roundRect", x + 0.24*s, y + 0.83*s, 1.1*s, 1.05*s, { fill: fill(shirt), line: fill(shirt) });
  add(slide, "line", x + 0.36*s, y + 1.05*s, -0.38*s, 0.44*s, { line: line("#FFD2A6", 4) });
  add(slide, "line", x + 1.2*s, y + 1.05*s, 0.38*s, 0.44*s, { line: line("#FFD2A6", 4) });
}

function deviceIcon(slide, icon, x, y, size, color = COLORS.deepBlue) {
  if (icon === "smartphone") {
    add(slide, "roundRect", x + size * 0.28, y + size * 0.08, size * 0.44, size * 0.82, { fill: fill("#FFFFFF"), line: line(color, 2) });
    add(slide, "rect", x + size * 0.34, y + size * 0.2, size * 0.32, size * 0.55, { fill: fill("#83DFFF"), line: fill("#83DFFF") });
    add(slide, "ellipse", x + size * 0.46, y + size * 0.79, size * 0.08, size * 0.08, { fill: fill(color), line: fill(color) });
    return;
  }
  if (icon === "youtube") {
    add(slide, "roundRect", x + size * 0.1, y + size * 0.22, size * 0.8, size * 0.56, { fill: fill(COLORS.red), line: fill(COLORS.red) });
    add(slide, "triangle", x + size * 0.44, y + size * 0.34, size * 0.26, size * 0.3, { fill: fill(COLORS.white), line: fill(COLORS.white), rotate: 90 });
    return;
  }
  if (icon === "car") {
    add(slide, "roundRect", x + size * 0.16, y + size * 0.45, size * 0.68, size * 0.28, { fill: fill(COLORS.red), line: line("#C72F2F", 1) });
    add(slide, "trapezoid", x + size * 0.32, y + size * 0.26, size * 0.36, size * 0.26, { fill: fill("#FF7A7A"), line: line("#C72F2F", 1) });
    add(slide, "ellipse", x + size * 0.25, y + size * 0.67, size * 0.16, size * 0.16, { fill: fill("#263043"), line: fill("#263043") });
    add(slide, "ellipse", x + size * 0.6, y + size * 0.67, size * 0.16, size * 0.16, { fill: fill("#263043"), line: fill("#263043") });
    return;
  }
  const map = {
    smartphone: "▯",
    "gamepad-2": "🎮",
    car: "🚗",
    youtube: "▶",
    bike: "🚲",
    cat: "🐱",
    dog: "🐶",
    stethoscope: "✚",
    lightbulb: "💡",
    rocket: "🚀",
    search: "🔎",
    heart: "♥",
    book: "▤",
    zap: "⚡",
  };
  text(slide, map[icon] || "●", x, y, size, size, { fontSize: size * 32, align: "center", color, bold: true, margin: 0 });
}

function bullets(slide, items, x, y, w, color = COLORS.green) {
  items.forEach((item, i) => {
    const yy = y + i * 0.58;
    add(slide, "ellipse", x, yy + 0.08, 0.24, 0.24, { fill: fill(color), line: fill(color) });
    text(slide, item, x + 0.38, yy, w, 0.42, { fontSize: 18, bold: true, color: COLORS.ink });
  });
}

function makeCover(slide, spec) {
  bg(slide, COLORS.purple);
  numberBadge(slide, spec.n, COLORS.purple);
  robot(slide, 0.55, 1.38, 1.92);
  text(slide, "YAPAY\nZEKA", 5.1, 1.1, 6.8, 2.0, { fontSize: 52, bold: true, color: COLORS.purple, align: "center", margin: 0 });
  text(slide, spec.subtitle, 5.35, 3.42, 5.9, 0.9, { fontSize: 25, bold: true, color: COLORS.ink, align: "center" });
  card(slide, 5.05, 4.55, 5.95, 1.0, "#FFFFFFCC");
  text(slide, "Çocuklar için eğlenceli yapay zeka dersi", 5.35, 4.82, 5.35, 0.42, { fontSize: 18, bold: true, color: COLORS.deepBlue, align: "center" });
}

function generic(slide, spec) {
  bg(slide, spec.n % 2 ? COLORS.green : COLORS.blue);
  title(slide, spec.title, spec.n, spec.n % 2 ? COLORS.green : COLORS.blue);
  robot(slide, 9.8, 4.65, 0.72);
  if (spec.type === "agenda") {
    child(slide, 9.3, 1.72, 1.05, COLORS.green);
    child(slide, 10.8, 1.85, 1.0, COLORS.pink, "#7C3F23");
    bullets(slide, spec.bullets, 2.0, 1.85, 5.8, COLORS.purple);
  } else if (spec.type === "cards") {
    spec.cards.forEach((c, i) => {
      const x = 1.2 + i * 2.85;
      card(slide, x, 2.0, 2.35, 2.5);
      deviceIcon(slide, c[1], x + 0.62, 2.38, 1.1, [COLORS.blue, COLORS.purple, COLORS.red, COLORS.red][i]);
      text(slide, c[0], x + 0.18, 3.95, 2.0, 0.42, { fontSize: 17, bold: true, align: "center" });
    });
  } else if (spec.type === "explain") {
    card(slide, 1.15, 1.65, 6.55, 4.2);
    text(slide, spec.body, 1.75, 2.05, 5.4, 3.3, { fontSize: 22, bold: true, color: COLORS.ink, breakLine: true, fit: "shrink" });
    robot(slide, 8.35, 2.05, 1.28);
    deviceIcon(slide, "lightbulb", 10.15, 1.42, 0.75, COLORS.yellow);
  } else if (spec.type === "bulletsArt") {
    bullets(slide, spec.bullets, 1.5, 2.0, 5.6, COLORS.yellow);
    child(slide, 8.6, 1.95, 1.35, COLORS.green);
    deviceIcon(slide, "bike", 8.4, 4.2, 1.3, COLORS.deepBlue);
  } else if (spec.type === "process") {
    spec.steps.forEach((step, i) => {
      const x = 0.85 + i * 3.1;
      robot(slide, x + 0.28, 2.0, 0.7, "normal");
      add(slide, "ellipse", x + 0.7, 4.48, 0.48, 0.48, { fill: fill([COLORS.yellow, COLORS.red, COLORS.blue, COLORS.green][i]), line: fill([COLORS.yellow, COLORS.red, COLORS.blue, COLORS.green][i]) });
      text(slide, step[0], x + 0.7, 4.48, 0.48, 0.48, { fontSize: 18, bold: true, align: "center", color: COLORS.white, margin: 0 });
      text(slide, step[1], x, 5.05, 1.95, 0.45, { fontSize: 16, bold: true, align: "center" });
      if (i < 3) text(slide, "→", x + 2.15, 3.05, 0.5, 0.5, { fontSize: 28, bold: true, color: COLORS.green, align: "center" });
    });
  } else if (spec.type === "choice") {
    spec.choices.forEach((c, i) => {
      const x = 2.0 + i * 5.0;
      card(slide, x, 2.0, 3.7, 3.25, i ? "#FFF4D8" : "#F2F7FF");
      deviceIcon(slide, c[1], x + 1.05, 2.3, 1.45);
      text(slide, c[0], x + 0.45, 4.45, 2.8, 0.5, { fontSize: 23, bold: true, align: "center" });
    });
    text(slide, "?", 6.17, 3.0, 1.0, 1.0, { fontSize: 54, bold: true, align: "center", color: COLORS.purple });
  } else if (spec.type === "celebrate") {
    robot(slide, 2.0, 2.2, 1.15);
    text(slide, spec.body, 5.1, 2.2, 5.9, 1.5, { fontSize: 27, bold: true, align: "center", color: COLORS.deepBlue });
    for (let i = 0; i < 12; i++) star(slide, 1.3 + (i % 6) * 1.85, 5.5 + (i % 2) * 0.45, 0.18, [COLORS.yellow, COLORS.pink, COLORS.green][i % 3]);
  } else if (spec.type === "usecase") {
    card(slide, 0.95, 1.72, 6.7, 4.35);
    bullets(slide, spec.bullets, 1.45, 2.2, 5.5, COLORS.red);
    deviceIcon(slide, spec.icon, 8.25, 2.15, 1.65, COLORS.deepBlue);
    if (spec.icon === "smartphone") child(slide, 9.35, 2.05, 1.12, COLORS.pink);
    else if (spec.icon === "car") robot(slide, 9.35, 2.2, 0.98);
    else if (spec.icon === "stethoscope") robot(slide, 9.2, 2.15, 1.05);
    else child(slide, 9.35, 2.1, 1.1, COLORS.blue);
  } else if (spec.type === "goodbad") {
    card(slide, 1.05, 1.68, 6.85, 4.45);
    bullets(slide, spec.bullets, 1.55, 2.1, 5.8, spec.good ? COLORS.green : COLORS.red);
    robot(slide, 8.65, 2.05, 1.08, spec.good ? "wave" : "normal");
    text(slide, spec.good ? "✓" : "×", 10.55, 1.75, 0.9, 0.9, { fontSize: 44, bold: true, align: "center", color: spec.good ? COLORS.green : COLORS.red });
  } else if (spec.type === "people") {
    child(slide, 3.0, 2.0, 1.15, COLORS.yellow);
    child(slide, 5.0, 2.08, 1.12, COLORS.pink);
    child(slide, 7.0, 2.0, 1.15, COLORS.orange);
    bullets(slide, spec.bullets, 1.35, 4.35, 9.0, COLORS.red);
  } else if (spec.type === "question") {
    child(slide, 2.8, 2.35, 1.25, COLORS.green);
    robot(slide, 7.8, 2.1, 1.18, "normal");
    text(slide, spec.subtitle, 4.7, 2.0, 3.1, 1.5, { fontSize: 28, bold: true, align: "center", color: COLORS.purple });
    text(slide, "?", 3.4, 4.7, 0.8, 0.8, { fontSize: 44, bold: true, color: COLORS.blue, align: "center" });
    text(slide, "?", 9.9, 1.72, 0.8, 0.8, { fontSize: 44, bold: true, color: COLORS.purple, align: "center" });
  } else if (spec.type === "quizOne") {
    card(slide, 1.15, 1.8, 6.9, 3.85);
    text(slide, spec.question, 1.65, 2.22, 5.95, 1.3, { fontSize: 34, bold: true, align: "center", color: COLORS.deepBlue });
    text(slide, spec.answer, 1.75, 4.15, 5.8, 0.8, { fontSize: 20, bold: true, align: "center" });
    child(slide, 8.7, 2.18, 1.2, COLORS.orange);
    robot(slide, 10.3, 2.28, 0.9);
  } else if (spec.type === "imagine") {
    text(slide, spec.body, 1.15, 1.8, 5.3, 1.0, { fontSize: 28, bold: true, color: COLORS.purple, align: "center" });
    add(slide, "ellipse", 6.6, 2.45, 2.4, 1.55, { fill: fill("#FFB0DB"), line: line(COLORS.pink, 2) });
    add(slide, "ellipse", 8.38, 2.85, 0.7, 0.7, { fill: fill("#FFB0DB"), line: line(COLORS.pink, 2) });
    add(slide, "line", 7.7, 3.95, -0.15, 0.7, { line: line(COLORS.pink, 4) });
    add(slide, "line", 8.25, 3.92, 0.2, 0.7, { line: line(COLORS.pink, 4) });
    text(slide, "😎", 7.18, 2.55, 0.8, 0.55, { fontSize: 24, align: "center" });
    star(slide, 5.95, 2.0, 0.3);
  } else if (spec.type === "future") {
    bullets(slide, spec.bullets, 1.2, 2.0, 4.85, COLORS.blue);
    deviceIcon(slide, "rocket", 7.3, 1.8, 1.4);
    robot(slide, 9.5, 2.5, 1.02);
    add(slide, "rect", 6.3, 5.18, 5.3, 0.45, { fill: fill("#72D5FF"), line: fill("#72D5FF") });
    add(slide, "triangle", 8.2, 4.55, 0.7, 0.7, { fill: fill(COLORS.green), line: fill(COLORS.green) });
  } else if (spec.type === "prompt") {
    child(slide, 7.7, 2.45, 1.1, COLORS.blue);
    child(slide, 9.2, 2.45, 1.1, COLORS.pink);
    card(slide, 1.25, 1.75, 5.55, 3.15, "#FFFFFFDD");
    text(slide, spec.body, 1.75, 2.18, 4.55, 1.5, { fontSize: 24, bold: true, align: "center" });
    text(slide, spec.foot, 1.75, 4.15, 4.55, 0.45, { fontSize: 18, bold: true, color: COLORS.purple, align: "center" });
  } else if (spec.type === "miniQuiz") {
    card(slide, 1.1, 1.65, 6.8, 4.55);
    spec.bullets.forEach((b, i) => {
      add(slide, "ellipse", 1.65, 2.15 + i * 0.9, 0.45, 0.45, { fill: fill([COLORS.yellow, COLORS.green, COLORS.blue][i]), line: fill([COLORS.yellow, COLORS.green, COLORS.blue][i]) });
      text(slide, String(i + 1), 1.65, 2.15 + i * 0.9, 0.45, 0.45, { fontSize: 16, bold: true, align: "center", color: COLORS.white, margin: 0 });
      text(slide, b, 2.28, 2.1 + i * 0.9, 4.8, 0.48, { fontSize: 18, bold: true });
    });
    robot(slide, 8.85, 2.3, 1.12);
    deviceIcon(slide, "search", 8.0, 2.2, 0.85);
  } else if (spec.type === "remember") {
    card(slide, 1.1, 1.8, 6.0, 3.45, "#FFFFFFDD");
    text(slide, spec.body, 1.6, 2.38, 5.0, 1.35, { fontSize: 25, bold: true, align: "center", color: COLORS.ink });
    child(slide, 7.5, 2.48, 1.05, COLORS.green);
    robot(slide, 9.2, 2.42, 1.0);
    text(slide, "🤝", 8.42, 3.65, 0.8, 0.8, { fontSize: 30, align: "center" });
  } else if (spec.type === "futureKids") {
    child(slide, 2.0, 2.38, 1.15, COLORS.yellow);
    child(slide, 5.2, 2.18, 1.2, COLORS.white, "#3A2518");
    robot(slide, 8.4, 2.12, 1.12);
    text(slide, spec.title, 3.0, 1.08, 7.4, 1.1, { fontSize: 34, bold: true, color: COLORS.deepBlue, align: "center" });
    deviceIcon(slide, "lightbulb", 6.35, 4.35, 0.85, COLORS.yellow);
  } else if (spec.type === "thanks") {
    robot(slide, 1.1, 2.15, 1.25);
    child(slide, 7.0, 3.0, 1.05, COLORS.orange);
    child(slide, 8.8, 3.0, 1.05, COLORS.green);
    text(slide, spec.subtitle, 4.35, 2.55, 5.0, 0.55, { fontSize: 25, bold: true, align: "center", color: COLORS.ink });
    text(slide, "👏 👏 👏", 5.0, 3.35, 3.3, 0.55, { fontSize: 26, align: "center" });
  }
}

export function createSlide(presentation, ctx, spec) {
  CTX = ctx;
  const slide = presentation.slides.add();
  if (spec.type === "cover") makeCover(slide, spec);
  else generic(slide, spec);
  return slide;
}

export function getSlideSpec(n) {
  return slides[n - 1];
}
