interface WaveformProps {
  isRecording: boolean;
  className?: string;
}

/** 녹음 파형 시각화 (7개 바) */
export default function Waveform({
  isRecording,
  className = "",
}: WaveformProps) {
  /* 각 바의 애니메이션 딜레이(ms)와 활성 높이 */
  const bars: { delay: string; height: string }[] = [
    { delay: "0ms", height: "h-4" },
    { delay: "150ms", height: "h-6" },
    { delay: "300ms", height: "h-8" },
    { delay: "450ms", height: "h-10" },
    { delay: "300ms", height: "h-8" },
    { delay: "150ms", height: "h-6" },
    { delay: "0ms", height: "h-4" },
  ];

  return (
    <div
      className={`flex items-center justify-center gap-1 ${className}`}
      role="img"
      aria-label={isRecording ? "녹음 중" : "녹음 대기"}
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          className={`w-1 rounded-full transition-all duration-300 ${
            isRecording
              ? `bg-gold ${bar.height} animate-bounce`
              : "bg-text-dim h-2"
          }`}
          style={
            isRecording
              ? { animationDelay: bar.delay, animationDuration: "800ms" }
              : undefined
          }
        />
      ))}
    </div>
  );
}
