// 스크롤에 따라 미디어가 확장되는 히어로 (원본: shadcn 커뮤니티 scroll-expansion-hero)
//
// 이식 메모 — 이 프로젝트는 Next.js가 아니라 Vite + React다:
//  - next/image → <img> (Vite에는 이미지 최적화 컴포넌트가 없다)
//  - 'use client' 지시문 제거 (서버 컴포넌트 개념이 없어 무의미)
//  - React 타입(WheelEvent/TouchEvent)은 window 리스너에 그대로 못 쓰므로 DOM 타입으로 교체
//
// ⚠ 동작 특성: 확장이 끝날 때까지 **페이지 스크롤을 가로챈다**(preventDefault + scrollTo(0,0)).
//   그만큼 인상은 강하지만 키보드 스크롤·모션 민감 사용자에게 부담이라,
//   reduced-motion에서는 가로채지 않고 바로 펼친 상태로 시작하도록 보완했다.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";

interface ScrollExpandMediaProps {
  mediaType?: "video" | "image";
  mediaSrc: string;
  posterSrc?: string;
  bgImageSrc: string;
  title?: string;
  date?: string;
  scrollToExpand?: string;
  textBlend?: boolean;
  /** 히어로 위에 얹히는 글자색. 기본값은 랜딩과 같은 크림(ON_INK). */
  textColor?: string;
  children?: ReactNode;
}

const ScrollExpandMedia = ({
  mediaType = "video",
  mediaSrc,
  posterSrc,
  bgImageSrc,
  title,
  date,
  scrollToExpand,
  textBlend,
  textColor = "#F2EFE3",
  children,
}: ScrollExpandMediaProps) => {
  // 모션 최소화 설정이면 스크롤 가로채기 없이 처음부터 펼쳐 보여준다
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [scrollProgress, setScrollProgress] = useState<number>(prefersReduced ? 1 : 0);
  const [showContent, setShowContent] = useState<boolean>(prefersReduced);
  const [mediaFullyExpanded, setMediaFullyExpanded] = useState<boolean>(prefersReduced);
  const [touchStartY, setTouchStartY] = useState<number>(0);
  const [isMobileState, setIsMobileState] = useState<boolean>(false);
  // 화면 크기 — 모바일에서 영상을 화면 크기까지 키우는 데 쓴다(0이면 데스크톱 기본값 사용)
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const sectionRef = useRef<HTMLDivElement | null>(null);

  // 원본에는 mediaType이 바뀌면 진행도를 0으로 되돌리는 useEffect가 있었으나,
  // 이펙트 안에서 setState를 직접 부르는 형태라 연쇄 렌더링을 일으킨다(eslint가 막는다).
  // 프롭이 바뀔 때 상태를 초기화하는 React의 권장 방식은 재마운트다 —
  // 미디어를 갈아끼우는 화면이라면 <ScrollExpandMedia key={mediaType} ... />로 쓸 것.

  useEffect(() => {
    if (prefersReduced) return;

    const handleWheel = (e: globalThis.WheelEvent) => {
      if (mediaFullyExpanded && e.deltaY < 0 && window.scrollY <= 5) {
        setMediaFullyExpanded(false);
        e.preventDefault();
      } else if (!mediaFullyExpanded) {
        e.preventDefault();
        const scrollDelta = e.deltaY * 0.0009;
        const newProgress = Math.min(Math.max(scrollProgress + scrollDelta, 0), 1);
        setScrollProgress(newProgress);

        if (newProgress >= 1) {
          setMediaFullyExpanded(true);
          setShowContent(true);
        } else if (newProgress < 0.75) {
          setShowContent(false);
        }
      }
    };

    const handleTouchStart = (e: globalThis.TouchEvent) => {
      setTouchStartY(e.touches[0].clientY);
    };

    const handleTouchMove = (e: globalThis.TouchEvent) => {
      if (!touchStartY) return;

      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;

      if (mediaFullyExpanded && deltaY < -20 && window.scrollY <= 5) {
        setMediaFullyExpanded(false);
        e.preventDefault();
      } else if (!mediaFullyExpanded) {
        e.preventDefault();
        // 되돌아갈 때(위로) 더 민감하게 — 아래로만 쉽고 위로 어려우면 갇힌 느낌이 든다
        const scrollFactor = deltaY < 0 ? 0.008 : 0.005;
        const scrollDelta = deltaY * scrollFactor;
        const newProgress = Math.min(Math.max(scrollProgress + scrollDelta, 0), 1);
        setScrollProgress(newProgress);

        if (newProgress >= 1) {
          setMediaFullyExpanded(true);
          setShowContent(true);
        } else if (newProgress < 0.75) {
          setShowContent(false);
        }

        setTouchStartY(touchY);
      }
    };

    const handleTouchEnd = (): void => {
      setTouchStartY(0);
    };

    const handleScroll = (): void => {
      if (!mediaFullyExpanded) {
        window.scrollTo(0, 0);
      }
    };

    // 키보드로도 진행할 수 있어야 한다 — 원본은 마우스·터치만 지원해 키보드 사용자가 갇힌다
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (mediaFullyExpanded) return;
      const down = ["ArrowDown", "PageDown", " ", "Enter"].includes(e.key);
      const up = ["ArrowUp", "PageUp"].includes(e.key);
      if (!down && !up) return;
      e.preventDefault();
      const next = Math.min(Math.max(scrollProgress + (down ? 0.2 : -0.2), 0), 1);
      setScrollProgress(next);
      if (next >= 1) {
        setMediaFullyExpanded(true);
        setShowContent(true);
      } else if (next < 0.75) {
        setShowContent(false);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("scroll", handleScroll);
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("keydown", handleKey);
    };
  }, [scrollProgress, mediaFullyExpanded, touchStartY, prefersReduced]);

  useEffect(() => {
    const measure = (): void => {
      setIsMobileState(window.innerWidth < 768);
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // 크기는 화면 크기를 목표로 삼아 늘린다.
  //
  // 원본은 증가폭을 픽셀로 고정했는데(모바일 가로 +650), 아래 style의 상한이 95vw라
  // 폭 390px 폰에서는 300px → 370px에서 곧바로 상한에 걸렸다. 진행도 11% 지점에서
  // 가로 성장이 끝나고 나머지 89%는 세로로만 400→600px 자라, 화면(844px)을 채우지
  // 못한 채 카드가 조금 길어지는 정도로 보였다. 스크롤은 끝까지 잠기는데 연출은
  // 약한, 손해만 보는 구간이었다.
  //
  // 그래서 모바일에서는 상한(95vw · 85vh)을 목표로 보간한다. 진행도 1에서 정확히
  // 화면을 채우고, 성장이 전 구간에 고르게 퍼진다. 데스크톱은 기존 값을 유지한다.
  const targetW = viewport.w * 0.95;
  const targetH = viewport.h * 0.85;
  const mediaWidth =
    isMobileState && targetW > 300 ? 300 + scrollProgress * (targetW - 300) : 300 + scrollProgress * 1250;
  const mediaHeight =
    isMobileState && targetH > 400 ? 400 + scrollProgress * (targetH - 400) : 400 + scrollProgress * 400;
  const textTranslateX = scrollProgress * (isMobileState ? 180 : 150);

  // 제목은 두 줄로 나뉘어 서로 반대 방향으로 벌어진다 — 자르는 위치가 곧 연출이다.
  // 원본은 첫 공백에서 잘랐지만(영어 "Immersive | Video Experience" 기준),
  // 한국어에서는 "좋은 | 캐디가 절반을 합니다"처럼 한쪽만 길어져 균형이 깨진다.
  // 가운데에 가장 가까운 공백을 고르면 두 언어 모두 자연스럽다.
  const [firstWord, restOfTitle] = (() => {
    if (!title) return ["", ""];
    const words = title.split(" ");
    if (words.length < 2) return [title, ""];
    const mid = Math.round(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  })();

  return (
    <div ref={sectionRef} className="transition-colors duration-700 ease-in-out overflow-x-hidden">
      <section className="relative flex flex-col items-center justify-start min-h-[100dvh]">
        <div className="relative w-full flex flex-col items-center min-h-[100dvh]">
          <motion.div
            className="absolute inset-0 z-0 h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 - scrollProgress }}
            transition={{ duration: 0.1 }}
          >
            <img
              src={bgImageSrc}
              alt=""
              aria-hidden="true"
              className="w-screen h-screen"
              style={{ objectFit: "cover", objectPosition: "center" }}
            />
            {/* 가독성 스크림 — 원본은 10%였으나 우리 새벽 페어웨이 사진이 중간 톤(평균 RGB 111,120,103)이라
                크림 글자 대비가 4.0:1에 그쳤다. 25%로 올리면 작은 글씨까지 4.9:1로 기준(4.5:1)을 넘긴다. */}
            <div className="absolute inset-0 bg-black/25" />
          </motion.div>

          <div className="container mx-auto flex flex-col items-center justify-start relative z-10">
            <div className="flex flex-col items-center justify-center w-full h-[100dvh] relative">
              <div
                className="absolute z-0 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-none rounded-2xl"
                style={{
                  width: `${mediaWidth}px`,
                  height: `${mediaHeight}px`,
                  maxWidth: "95vw",
                  maxHeight: "85vh",
                  boxShadow: "0px 0px 50px rgba(0, 0, 0, 0.3)",
                }}
              >
                {mediaType === "video" ? (
                  <div className="relative w-full h-full pointer-events-none">
                    <video
                      src={mediaSrc}
                      poster={posterSrc}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="auto"
                      className="w-full h-full object-cover rounded-xl"
                      controls={false}
                      disablePictureInPicture
                      disableRemotePlayback
                    />
                    <div className="absolute inset-0 z-10" style={{ pointerEvents: "none" }} />
                    <motion.div
                      className="absolute inset-0 bg-black/30 rounded-xl"
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: 0.5 - scrollProgress * 0.3 }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                ) : (
                  <div className="relative w-full h-full">
                    <img
                      src={mediaSrc}
                      alt={title || "Media content"}
                      className="w-full h-full object-cover rounded-xl"
                    />
                    <motion.div
                      className="absolute inset-0 bg-black/50 rounded-xl"
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: 0.7 - scrollProgress * 0.3 }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                )}

                <div className="flex flex-col items-center text-center relative z-10 mt-4 transition-none">
                  {date && (
                    <p
                      className="text-2xl"
                      style={{ color: textColor, transform: `translateX(-${textTranslateX}vw)` }}
                    >
                      {date}
                    </p>
                  )}
                  {scrollToExpand && (
                    <p
                      className="font-medium text-center"
                      style={{ color: textColor, transform: `translateX(${textTranslateX}vw)` }}
                    >
                      {scrollToExpand}
                    </p>
                  )}
                </div>
              </div>

              {/* 표제는 h1 하나로 묶는다 — 원본은 h2 두 개라 페이지에 h1이 없어지고
                  제목이 쪼개져 색인된다. 두 줄이 반대로 벌어지는 연출은 span으로 유지. */}
              <h1
                className={`flex items-center justify-center text-center gap-4 w-full relative z-10 transition-none flex-col ${
                  textBlend ? "mix-blend-difference" : "mix-blend-normal"
                }`}
              >
                <motion.span
                  className="block text-4xl md:text-5xl lg:text-6xl font-bold transition-none"
                  style={{ color: textColor, transform: `translateX(-${textTranslateX}vw)` }}
                >
                  {firstWord}
                </motion.span>
                <motion.span
                  className="block text-4xl md:text-5xl lg:text-6xl font-bold text-center transition-none"
                  style={{ color: textColor, transform: `translateX(${textTranslateX}vw)` }}
                >
                  {restOfTitle}
                </motion.span>
              </h1>
            </div>

            <motion.section
              className="flex flex-col w-full px-8 py-10 md:px-16 lg:py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: showContent ? 1 : 0 }}
              transition={{ duration: 0.7 }}
            >
              {children}
            </motion.section>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ScrollExpandMedia;
