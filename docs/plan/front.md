Plan to implement                                                                                                        │
│                                                                                                                          │
│ NEON ARENA - Cyberpunk + NFT Card Game Frontend Redesign                                                                 │
│                                                                                                                          │
│ Context                                                                                                                  │
│                                                                                                                          │
│ 현재 프론트엔드는 Tailwind 기본 gray+indigo 팔레트에 커스텀 폰트, 애니메이션, CSS 변수 없이 flat한 기술 데모 수준.       │
│ 사이버펑크 + NFT 카드뽑기 게임 느낌으로 전면 리디자인. 모든 비즈니스 로직(hooks, lib)은 변경하지 않고 UI 레이어만 교체.  │
│                                                                                                                          │
│ Design Direction: "NEON ARENA"                                                                                           │
│                                                                                                                          │
│ - 다크 배경 + 네온 글로우 (cyan, magenta, green, orange)                                                                 │
│ - 카드게임 메타포: 피처 카드가 수집형 트레이딩 카드처럼 보임                                                             │
│ - 글리치/스캔라인 효과, 홀로그래픽 쉬머, 네온 펄스 보더                                                                  │
│ - 피처별 고유 네온 색상: F1=Cyan, F4=Magenta, F5=Orange, F8=Green                                                        │
│                                                                                                                          │
│ Typography                                                                                                               │
│                                                                                                                          │
│ - Display: Orbitron (Google Fonts) - 미래적 기하학 폰트                                                                  │
│ - Body: Rajdhani (Google Fonts) - 세미 컨덴스드 테크 느낌                                                                │
│ - Code: JetBrains Mono (Google Fonts) - 해시/주소용 모노스페이스                                                         │
│                                                                                                                          │
│ Color System (CSS Variables via @theme)                                                                                  │
│ ┌──────────────┬─────────┬─────────────────┐                                                                             │
│ │    Token     │  Color  │      Usage      │                                                                             │
│ ├──────────────┼─────────┼─────────────────┤                                                                             │
│ │ bg-deep      │ #0a0e1a │ 배경            │                                                                             │
│ ├──────────────┼─────────┼─────────────────┤                                                                             │
│ │ neon-cyan    │ #00f0ff │ F1, 기본 액센트 │                                                                             │
│ ├──────────────┼─────────┼─────────────────┤                                                                             │
│ │ neon-magenta │ #ff00aa │ F4              │                                                                             │
│ ├──────────────┼─────────┼─────────────────┤                                                                             │
│ │ neon-green   │ #39ff14 │ F8, 성공        │                                                                             │
│ ├──────────────┼─────────┼─────────────────┤                                                                             │
│ │ neon-orange  │ #ff6600 │ F5              │                                                                             │
│ ├──────────────┼─────────┼─────────────────┤                                                                             │
│ │ neon-yellow  │ #ffe600 │ Legendary, 경고 │                                                                             │
│ ├──────────────┼─────────┼─────────────────┤                                                                             │
│ │ neon-purple  │ #bf00ff │ Epic            │                                                                             │
│ └──────────────┴─────────┴─────────────────┘                                                                             │
│ Animations (10개, 모두 CSS-only)                                                                                         │
│                                                                                                                          │
│ neon-pulse, glitch, scanline, holographic, card-flip, neon-flicker, slide-in, glow-breathe, data-stream, matrix-rain     │
│                                                                                                                          │
│ 수정 파일 목록 (12개, 4 Phase)                                                                                           │
│                                                                                                                          │
│ Phase 1: Foundation (의존성 기반)                                                                                        │
│                                                                                                                          │
│ 1. frontend/index.html - Google Fonts 링크, 타이틀 변경                                                                  │
│ 2. frontend/src/index.css - @theme 토큰, @keyframes 10개, 유틸리티 클래스 (glass-panel, scanline-overlay, grid-bg,       │
│ holographic, neon-text-*, hex-badge, playing-card, data-stream-bg, stagger-in, neon-input)                               │
│ 3. frontend/src/lib/types.ts - RARITY_COLORS만 네온 클래스로 변경                                                        │
│                                                                                                                          │
│ Phase 2: Shared Components                                                                                               │
│                                                                                                                          │
│ 4. frontend/src/components/Layout.tsx - glass-panel 사이드바, 글리치 로고, 네온 nav, 그리드 배경                         │
│ 5. frontend/src/components/StepCard.tsx - 네온 보더, hex-badge 스텝 번호, glass-panel                                    │
│ 6. frontend/src/components/ProofStatus.tsx - data-stream 배경, font-display, 네온 프로그레스                             │
│ 7. frontend/src/components/TxStatus.tsx - 네온 펄스, CONFIRMED 뱃지                                                      │
│                                                                                                                          │
│ Phase 3: Pages (Phase 1-2 완료 후 독립 수정 가능)                                                                        │
│                                                                                                                          │
│ 8. frontend/src/pages/HomePage.tsx - 트레이딩 카드 스타일, 홀로그래픽 쉬머, 3D 틸트 효과, 글리치 타이틀                  │
│ 9. frontend/src/pages/F1PrivateNFTPage.tsx - Cyan 테마 적용                                                              │
│ 10. frontend/src/pages/F4LootBoxPage.tsx - Magenta 테마, 루트박스 리빌 애니메이션                                        │
│ 11. frontend/src/pages/F5GamingItemTradePage.tsx - Orange 테마                                                           │
│ 12. frontend/src/pages/F8CardDrawPage.tsx - Green 테마, 플레잉카드 UI, 카드 플립 애니메이션, 팬 배열                     │
│                                                                                                                          │
│ Phase 4: 검증                                                                                                            │
│                                                                                                                          │
│ - cd frontend && npx tsc --noEmit (TypeScript 빌드)                                                                      │
│ - cd frontend && npm run build (Vite 빌드)                                                                               │
│ - 브라우저에서 시각적 확인                                                                                               │
│                                                                                                                          │
│ 변경하지 않는 파일 (READ-ONLY)                                                                                           │
│                                                                                                                          │
│ - frontend/src/hooks/* (useWallet, useContract, useProofGeneration)                                                      │
│ - frontend/src/lib/crypto.ts, contracts.ts, noteUtils.ts, cardUtils.ts, proofGenerator.ts                                │
│ - frontend/src/lib/*.d.ts                                                                                                │
│ - frontend/src/config/deployedAddresses.json                                                                             │
│ - frontend/src/abi/*                                                                                                     │
│                                                                                                                          │
│ 새 의존성                                                                                                                │
│                                                                                                                          │
│ - 없음. 모든 효과 CSS-only. 폰트는 Google Fonts CDN.        