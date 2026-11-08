import type { CSSProperties } from "react";

/**
 * Temporary stand-in for photography that does not exist yet. It is always
 * labelled as a placeholder — on screen and to assistive technology — so it can
 * never be mistaken for real merchandise imagery.
 */
export function Placeholder({
  alt,
  tint,
  label,
  suffix = "placeholder — photograph to come",
  className = "",
  showLabel = true,
}: {
  alt: string;
  tint?: string;
  label: string;
  suffix?: string;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`${alt} (${suffix})`}
      className={`placeholder-photo ${className}`}
      style={tint ? ({ "--ph-tint": tint } as CSSProperties) : undefined}
    >
      {showLabel && (
        <span className="absolute bottom-3 left-3 max-w-[85%] text-micro text-ink/55">
          {label}
        </span>
      )}
    </div>
  );
}
