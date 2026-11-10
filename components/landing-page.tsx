"use client";

import { ArrowRight, ChevronDown, ChevronRight, FileText, Folder, GitBranch, Maximize2, Search, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "@/app/landing.css";

type Point = { x: number; y: number; size: number; cluster: number };

const clusters = [
  { x: 152, y: 170, rx: 113, ry: 83, count: 37 },
  { x: 327, y: 105, rx: 113, ry: 70, count: 35 },
  { x: 402, y: 252, rx: 114, ry: 87, count: 38 },
  { x: 214, y: 298, rx: 103, ry: 80, count: 31 },
  { x: 547, y: 165, rx: 81, ry: 88, count: 29 },
];

function unit(seed: number) {
  const value = Math.sin(seed * 127.1 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

const points: Point[] = clusters.flatMap((cluster, clusterIndex) =>
  Array.from({ length: cluster.count }, (_, index) => {
    const angle = unit(clusterIndex * 100 + index * 3 + 1) * Math.PI * 2;
    const radius = Math.sqrt(unit(clusterIndex * 100 + index * 3 + 2));
    return {
      x: cluster.x + Math.cos(angle) * cluster.rx * radius,
      y: cluster.y + Math.sin(angle) * cluster.ry * radius,
      size: index % 17 === 0 ? 4.4 : index % 7 === 0 ? 2.7 : 1.65,
      cluster: clusterIndex,
    };
  }),
);

const edges = points.flatMap((point, index) => {
  const nearby = points
    .map((other, otherIndex) => ({ otherIndex, distance: Math.hypot(point.x - other.x, point.y - other.y) }))
    .filter(({ otherIndex, distance }) => otherIndex > index && distance < 49 && points[otherIndex].cluster === point.cluster)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  return nearby.map(({ otherIndex }) => [index, otherIndex] as const);
}).concat([[10, 42], [57, 82], [91, 128], [34, 126], [117, 155], [25, 70], [65, 110]] as (readonly [number, number])[]);

function KnowledgeGraph({ labelled = false }: { labelled?: boolean }) {
  const labels = [
    [2, "프로젝트 개요"], [24, "제품 로드맵"], [42, "사용자 리서치"],
    [61, "디자인 원칙"], [82, "지식 그래프"], [101, "API 가이드"],
    [123, "회의 기록"], [145, "AI 활용 가이드"],
  ] as const;
  return (
    <svg className="landing-graph" viewBox="0 0 650 390" role="img" aria-label="여러 문서가 연결된 지식 그래프 예시">
      <g fill="none" stroke="#a9bfcb" strokeWidth="0.85" opacity="0.54">
        {edges.map(([from, to], index) => (
          <line key={index} x1={points[from].x} y1={points[from].y} x2={points[to].x} y2={points[to].y} />
        ))}
      </g>
      <g>
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={point.size} fill={point.size > 3 ? "#6b8da5" : "#9bb5c6"} opacity={point.size > 3 ? 0.95 : 0.76} />
        ))}
      </g>
      {labelled && labels.map(([index, label]) => (
        <text key={index} x={points[index].x + 7} y={points[index].y + 3} fill="#617a88" fontSize="8.8">{label}</text>
      ))}
    </svg>
  );
}

const documentGroups = [
  { heading: "프로젝트", items: ["제품 로드맵", "스프린트 회고", "요구사항 정의서", "릴리스 노트"] },
  { heading: "디자인", items: ["디자인 원칙", "컴포넌트 가이드", "사용자 리서치"] },
  { heading: "엔지니어링", items: ["시스템 아키텍처", "API 가이드", "데이터 모델"] },
  { heading: "운영", items: ["온보딩 가이드", "회의 기록"] },
];

function ServicePreview({ full = false, onClose, closeButtonRef }: { full?: boolean; onClose?: () => void; closeButtonRef?: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <div className={`landing-preview-shell${full ? " landing-preview-shell--full" : ""}`}>
      <div className="landing-preview-app">
        <aside className="landing-preview-sidebar" aria-label="예시 문서 목록">
          <div className="landing-preview-workspace">Company Handbook <ChevronDown size={12} /></div>
          <div className="landing-preview-sidebar-icons"><Folder size={14} /><GitBranch size={14} /><FileText size={14} /><Search size={14} /><Sparkles size={14} /></div>
          <div className="landing-preview-nav-heading">최근</div>
          <div className="landing-preview-nav-item">프로젝트 개요</div>
          <div className="landing-preview-nav-item">제품 로드맵</div>
          <div className="landing-preview-nav-item">회의 노트</div>
          <div className="landing-preview-nav-heading landing-preview-nav-heading--spaced">문서</div>
          {documentGroups.map((group) => (
            <div className="landing-preview-group" key={group.heading}>
              <div className="landing-preview-group-title"><ChevronDown size={10} />{group.heading}</div>
              {group.items.map((item) => <div className="landing-preview-nav-item landing-preview-nav-item--child" key={item}>{item}</div>)}
            </div>
          ))}
          <div className="landing-preview-sidebar-bottom">예시 화면 · 지식 그래프</div>
        </aside>
        <section className="landing-preview-main" aria-label="예시 지식 그래프 화면">
          <div className="landing-preview-tab"><span>Welcome</span><X size={11} /><span className="landing-preview-plus">+</span></div>
          <div className="landing-preview-toolbar"><span>←</span><span>→</span><strong>그래프 보기</strong></div>
          <div className="landing-preview-graph-stage">
            <KnowledgeGraph labelled />
            <div className="landing-preview-filter"><div>⌄ &nbsp; 범례 <X size={10} /></div><div>□ &nbsp; 태그</div><div>□ &nbsp; 폴더 구조</div><hr /><div>› &nbsp; 표시</div><hr /><div>› &nbsp; 필터</div><hr /><div>› &nbsp; 설정</div></div>
          </div>
        </section>
        <aside className="landing-preview-right"><div className="landing-preview-right-icons">▣ &nbsp; ◉ &nbsp; ◷ &nbsp; ♧</div><strong>개요</strong><span>기록을 지식으로 연결</span></aside>
        <div className="landing-preview-ai">
          <div className="landing-preview-ai-title"><Sparkles size={13} /> 워크스페이스 AI <span>×</span></div>
          <div className="landing-preview-ai-model">모델 <span>선택한 AI</span></div>
          <div className="landing-preview-ai-question">프로젝트 진행 상황을 요약해 줘</div>
          <div className="landing-preview-ai-answer">
            <strong>최근 문서를 바탕으로 정리했어요.</strong>
            <p>• 이번 분기 핵심 목표는 문서 탐색 시간을 줄이고, 팀의 결정 근거를 쉽게 찾도록 하는 것입니다.</p>
            <p>• 디자인 시스템 정리와 지식 그래프 개선이 진행 중이며, 다음 릴리스에서 검색 경험을 다듬을 예정입니다.</p>
            <p>관련 문서에서 세부 내용을 확인할 수 있어요.</p>
          </div>
          <div className="landing-preview-ai-sources">출처 &nbsp; <span>프로젝트 개요 · 제품 로드맵 · 스프린트 회고</span></div>
          <div className="landing-preview-ai-input">이 워크스페이스에 대해 질문하기 <Send size={13} /></div>
        </div>
      </div>
      {full && <button ref={closeButtonRef} className="landing-preview-close" type="button" onClick={onClose} aria-label="미리보기 닫기"><X size={20} /><span>닫기</span></button>}
    </div>
  );
}

export function LandingPage({ loginForm }: { loginForm: ReactNode }) {
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [isLoginOpen, setLoginOpen] = useState(false);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const loginCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isPreviewOpen && !isLoginOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewOpen(false);
        setLoginOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    (isPreviewOpen ? previewCloseRef : loginCloseRef).current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isPreviewOpen, isLoginOpen]);

  return (
    <main className="landing">
      <div className="landing-container">
        <header className="landing-header">
          <a className="landing-logo" href="/" aria-label="문집 홈"><strong>문집</strong><small>MUNJIB</small></a>
          <nav className="landing-nav" aria-label="서비스 소개"><a href="#documents">문서</a><a href="#graph">지식 그래프</a><a href="#assistant">AI 어시스턴트</a></nav>
          <button className="landing-header-login" type="button" onClick={() => setLoginOpen(true)}>로그인</button>
        </header>

        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">나만의 지식 탐색 공간</p>
            <h1 id="landing-title">기록을 잇고,<br />생각을 확장하세요.</h1>
            <p className="landing-description">문서와 아이디어를 한곳에 모으고,<br />연결된 지식 속에서 필요한 답을 찾아보세요.</p>
            <div className="landing-hero-actions"><button className="landing-primary-button" type="button" onClick={() => setPreviewOpen(true)}>데모 둘러보기 <ArrowRight size={15} /></button><button className="landing-secondary-button" type="button" onClick={() => setLoginOpen(true)}>로그인하기 <ArrowRight size={14} /></button></div>
            <p className="landing-hero-note">가입 없이 읽기 전용으로 둘러볼 수 있어요.</p>
            <div className="landing-features"><div id="documents"><strong>문서와 위키</strong><span>기록을 한곳에 정리</span></div><div id="graph"><strong>지식 그래프</strong><span>문서 사이의 연결 발견</span></div><div id="assistant"><strong>문서 기반 AI</strong><span>내 지식에 질문하기</span></div></div>
          </div>
          <div className="landing-hero-art"><KnowledgeGraph /></div>
        </section>

        <section className="landing-preview-section" aria-label="서비스 미리보기">
          <div className="landing-preview-intro"><p>기록이 연결되는 순간,<br />문서와 문서가 이어져 나만의 지식 지도가 됩니다.</p>
            <button type="button" className="landing-expand-arrow" onClick={() => setPreviewOpen(true)} aria-label="서비스 미리보기를 전체 화면으로 보기"><svg viewBox="0 0 80 65" fill="none" aria-hidden="true"><path d="M6 11 34 25c4 2 8 2 12 0L74 11M15 37l19 11c4 2 8 2 12 0l19-11" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg><span>미리보기 펼치기</span></button>
          </div>
          <button type="button" className="landing-preview-trigger" onClick={() => setPreviewOpen(true)} aria-label="서비스 미리보기를 전체 화면으로 보기"><ServicePreview /><span className="landing-preview-hover"><Maximize2 size={16} /> 화면 가득 보기</span></button>
        </section>
      </div>

      {isPreviewOpen && <div className="landing-overlay landing-overlay--preview" role="dialog" aria-modal="true" aria-label="서비스 전체 화면 미리보기"><div className="landing-preview-overlay-inner"><ServicePreview full onClose={() => setPreviewOpen(false)} closeButtonRef={previewCloseRef} /></div></div>}
      {isLoginOpen && <div className="landing-overlay landing-overlay--login" role="dialog" aria-modal="true" aria-label="로그인" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}><div className="landing-login-dialog"><button ref={loginCloseRef} className="landing-login-close" type="button" onClick={() => setLoginOpen(false)} aria-label="로그인 창 닫기"><X size={19} /></button>{loginForm}</div></div>}
    </main>
  );
}
