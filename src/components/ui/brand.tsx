/**
 * The GSC logo, from the supplied vector files.
 *
 * The guideline draws two versions, one for light backgrounds and one for dark. Both are
 * rendered and CSS shows the right one, using the same .show-light / .show-dark rules the
 * theme toggle uses, so the logo is correct on the first paint even when the theme comes
 * from the operating system. The hidden copy is marked aria-hidden so the name is announced
 * once. Below about 40px tall the descriptor stops being legible, so small places use the
 * mark on its own.
 */

type Props = { className?: string };

const LOCKUP_RATIO = "aspect-[3.157/1]";
const MARK_RATIO = "aspect-[1.122/1]";

export function GscLockup({ className = "h-10" }: Props) {
  return (
    <span className={`relative inline-flex ${LOCKUP_RATIO} ${className}`} role="img" aria-label="GSC Gemmological School">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gsc-lockup-light.svg" alt="" aria-hidden className="show-light h-full w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gsc-lockup-dark.svg" alt="" aria-hidden className="show-dark h-full w-full" />
    </span>
  );
}

export function GscMark({ className = "h-7" }: Props) {
  return (
    <span className={`relative inline-flex ${MARK_RATIO} ${className}`} role="img" aria-label="GSC">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gsc-mark-light.svg" alt="" aria-hidden className="show-light h-full w-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/gsc-mark-dark.svg" alt="" aria-hidden className="show-dark h-full w-full" />
    </span>
  );
}

/** Decorative watermark: the mark, very faint, behind a hero panel. */
export function GscWatermark({ className = "" }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/gsc-mark-dark.svg"
      alt=""
      aria-hidden
      className={`pointer-events-none select-none opacity-[0.06] ${className}`}
    />
  );
}
