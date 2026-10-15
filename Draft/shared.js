// 시안 공통: 샘플 폴더 트리 · 선택 모델 · 앱 셸 렌더링
// n = 그 폴더에 "직접" 들어있는 이미지 수 (하위 폴더 제외)

const TREE = [
  {
    name: "레퍼런스", path: "D:\\Art\\Reference", hue: 250, n: 0, children: [
      {
        name: "포즈", n: 6, hue: 255, children: [
          { name: "남성", n: 0, hue: 220, children: [{ name: "서있는", n: 42 }, { name: "앉은", n: 28 }, { name: "역동", n: 35 }] },
          { name: "여성", n: 0, hue: 310, children: [{ name: "서있는", n: 51 }, { name: "앉은", n: 33 }, { name: "역동", n: 40 }] },
          { name: "커플", n: 18, hue: 20 },
        ],
      },
      { name: "손", n: 42, hue: 30, children: [{ name: "쥐는 손", n: 22 }, { name: "가리키는 손", n: 14 }] },
      { name: "얼굴", n: 0, hue: 5, children: [{ name: "정면", n: 30 }, { name: "측면", n: 26 }, { name: "표정", n: 45 }] },
      { name: "의상 주름", n: 37, hue: 190 },
      { name: "GIF 동작", n: 0, hue: 160, children: [{ name: "걷기", n: 12, gif: true }, { name: "달리기", n: 9, gif: true }, { name: "점프", n: 7, gif: true }] },
    ],
  },
  {
    name: "크로키 모음 2024", path: "E:\\Croquis\\2024", hue: 40, n: 0, children: [
      { name: "1월", n: 80 }, { name: "2월", n: 72 }, { name: "3월", n: 95 }, { name: "4월", n: 61 },
    ],
  },
  { name: "동물", path: "D:\\Art\\Animals", hue: 120, n: 58, children: [] },
];

const NODES = {};
let _id = 0;
(function walk(list, parent, depth) {
  list.forEach((node, i) => {
    node.id = "f" + _id++;
    node.parent = parent;
    node.depth = depth;
    node.children = node.children || [];
    node.hue = node.hue ?? (parent.hue + (i + 1) * 17) % 360;
    node.gif = node.gif || false;
    NODES[node.id] = node;
    walk(node.children, node, depth + 1);
    node.total = node.n + node.children.reduce((s, c) => s + c.total, 0);
  });
})(TREE, null, 0);

function rootOf(node) { while (node.parent) node = node.parent; return node; }
function ancestors(node) { const out = []; while (node) { out.unshift(node); node = node.parent; } return out; }
function subtree(node, out = []) { out.push(node); node.children.forEach((c) => subtree(c, out)); return out; }
function fullPath(node) { return ancestors(node).map((a) => a.name).join(" › "); }
function allNodes() { return Object.values(NODES); }

// ---------- 선택 모델 ----------
// 이미지가 있는 폴더(n>0)만 선택 단위. 상위 폴더 체크 = 하위 전체 체크.
const sel = new Set();
function selCount(node) { return subtree(node).reduce((s, x) => s + (sel.has(x.id) ? x.n : 0), 0); }
function selState(node) {
  if (node.total === 0) return "none";
  const c = selCount(node);
  return c === 0 ? "none" : c === node.total ? "all" : "some";
}
function setSubtree(node, on) { subtree(node).forEach((x) => { if (x.n > 0) on ? sel.add(x.id) : sel.delete(x.id); }); }
function toggleSel(node) { setSubtree(node, selState(node) !== "all"); emitSel(); }
function soloSel(node) { sel.clear(); setSubtree(node, true); emitSel(); }
function clearSel() { sel.clear(); emitSel(); }
function selTotal() { let s = 0; sel.forEach((id) => (s += NODES[id].n)); return s; }

/** 선택을 사람이 읽기 좋게 압축: 완전히 선택된 가장 위 폴더들만 */
function selSummary() {
  // 반환: [{ node, onlyDirect }] — onlyDirect = 하위 폴더 없이 그 폴더 이미지만 선택됨
  const out = [];
  (function visit(list) {
    list.forEach((n) => {
      const st = selState(n);
      if (st === "all") out.push({ node: n, onlyDirect: false });
      else if (st === "some") {
        if (sel.has(n.id)) out.push({ node: n, onlyDirect: true });
        visit(n.children);
      }
    });
  })(TREE);
  return out;
}
function emitSel() { window.dispatchEvent(new Event("selchange")); }

function cboxHtml(node, extra = "") {
  const st = selState(node);
  const icon = st === "all" ? '<i class="ph-bold ph-check"></i>' : st === "some" ? '<i class="ph-bold ph-minus"></i>' : "";
  return `<span class="cbox ${st}" data-check="${node.id}" ${extra} role="checkbox" aria-checked="${st === "all" ? "true" : st === "some" ? "mixed" : "false"}">${icon}</span>`;
}

// ---------- 썸네일 자리표시자 (그라데이션 + 인물 실루엣) ----------
function thumbBg(node, i = 0) {
  const h = (node.hue + i * 23) % 360;
  const x = 38 + ((i * 37) % 26);
  const tilt = (i * 13) % 20;
  return [
    `radial-gradient(circle at ${x}% 24%, hsla(${h},22%,74%,.32) 0 8%, transparent 8.6%)`,
    `radial-gradient(ellipse 15% 34% at ${x + tilt / 4}% 58%, hsla(${h},20%,70%,.22) 0 96%, transparent 100%)`,
    `linear-gradient(${150 + tilt}deg, hsl(${h} 16% 24%), hsl(${(h + 30) % 360} 14% 10%))`,
  ].join(",");
}

function previewsOf(node, k) {
  // 폴더(하위 포함)에서 썸네일 k개 뽑기: 직접 이미지 먼저, 그 다음 하위 폴더
  const out = [];
  subtree(node).forEach((x) => { for (let i = 0; i < Math.min(x.n, k); i++) out.push([x, i]); });
  return out.slice(0, k);
}

// ---------- 앱 셸 ----------
function renderShell({ draft, sidebarWidth }) {
  const drafts = [["A", "a-sidebar-tree.html", "A · 사이드바 트리"], ["B", "b-library-cards.html", "B · 라이브러리 카드"], ["C", "c-column-browser.html", "C · 컬럼 브라우저"]];
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="app" style="--sidebar-w:${sidebarWidth || 300}px">
      <header class="topbar">
        <div class="logo"><i class="ph-fill ph-pencil-simple-line"></i>crokit</div>
        <button class="menu">파일</button><button class="menu">보기</button><button class="menu">이미지</button><button class="menu">설정</button>
        <div class="spacer"></div>
        <nav class="draft-switch">
          <a href="index.html" title="시안 비교"><i class="ph ph-squares-four"></i></a>
          ${drafts.map(([k, href, label]) => `<a href="${href}" class="${k === draft ? "on" : ""}">${label}</a>`).join("")}
        </nav>
        <div class="spacer"></div>
        <span class="win-ctl"><i class="ph ph-minus"></i></span><span class="win-ctl"><i class="ph ph-square"></i></span><span class="win-ctl"><i class="ph ph-x"></i></span>
      </header>
      <div class="body">
        <aside class="sidebar">
          <div class="side-tabs">
            <button class="on"><i class="ph ph-play-circle"></i>세션</button>
            <button><i class="ph ph-clock-counter-clockwise"></i>히스토리</button>
          </div>
          <div class="side-scroll">
            <div id="folder-slot"></div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div class="section-label">한 장당 시간</div>
              <div class="chips"><span class="chip">30초</span><span class="chip on">1분</span><span class="chip">2분</span><span class="chip">5분</span><span class="chip">10분</span></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div class="section-label">장수</div>
              <div class="chips"><span class="chip">10</span><span class="chip on">20</span><span class="chip">30</span><span class="chip">∞</span></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div class="section-label">순서</div>
              <div class="chips" style="grid-template-columns:1fr 1fr"><span class="chip on">랜덤</span><span class="chip">순서대로</span></div>
            </div>
          </div>
          <div class="side-foot"><button class="start-btn" id="start-btn"></button></div>
        </aside>
        <main class="stage" id="stage">
          <div class="stage-photo"><div class="img" id="stage-img"></div></div>
          <div class="dock">
            <button class="btn btn-quiet btn-icon"><i class="ph ph-caret-left"></i></button>
            <button class="btn btn-fill btn-icon" style="width:34px;height:34px"><i class="ph-fill ph-play"></i></button>
            <button class="btn btn-quiet btn-icon"><i class="ph ph-caret-right"></i></button>
            <span class="sep"></span>
            <button class="btn btn-quiet btn-icon"><i class="ph ph-circle-half"></i></button>
            <button class="btn btn-quiet btn-icon"><i class="ph ph-flip-horizontal"></i></button>
            <button class="btn btn-quiet btn-icon"><i class="ph ph-grid-nine"></i></button>
          </div>
        </main>
      </div>
    </div>`
  );
  const syncStart = () => {
    const total = selTotal();
    const btn = document.getElementById("start-btn");
    btn.disabled = total === 0;
    btn.innerHTML = total ? `<i class="ph-fill ph-play"></i>시작 <small>· ${total}장 중 20장</small>` : "폴더를 선택하세요";
    const first = [...sel][0];
    document.getElementById("stage-img").style.background = first ? thumbBg(NODES[first], 3) : "var(--color-surface)";
  };
  window.addEventListener("selchange", syncStart);
  syncStart();
}

function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + `<span class="mark">${esc(text.slice(i, i + q.length))}</span>` + esc(text.slice(i + q.length));
}
