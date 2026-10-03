"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "./lib/spinner";

const SPIN_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </svg>
);

// Phones get shorter reels so a draw fits on screen with its heading and buttons.
const isPhoneWidth = () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;

// Card outline, reel accent, and spin button color for sides that need telling apart.
const TONE_ACCENTS = { blue: "#1f4f8f", green: "#135248" } as const;
type SpinnerTone = keyof typeof TONE_ACCENTS;

function SpinnerActions({
  onSpin,
  canSpin = true,
  spinDisabled = false,
  spinLabel = "Spin",
  useLabel,
  onUse,
  canUse,
}: {
  onSpin: () => void;
  canSpin?: boolean;
  spinDisabled?: boolean;
  spinLabel?: string;
  useLabel: string;
  onUse: () => void;
  canUse: boolean;
}) {
  return (
    <div className="topic-spinner-actions">
      {canSpin ? (
        <button className="topic-spinner-spin" type="button" onClick={onSpin} disabled={spinDisabled}>
          {SPIN_ICON}
          {spinLabel}
        </button>
      ) : null}
      <button className="topic-spinner-use" type="button" onClick={onUse} disabled={!canUse}>
        {useLabel}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

// Physics reel from the off_the_cuff topic-spinner spec (variant A: 110px items in a 330px window).
// The engine picks the result itself; onLand reports it once the reel settles.
export function TopicSpinner({
  items,
  onSpinStart,
  onLand,
  useLabel,
  onUse,
  canUse,
  showActions = true,
}: {
  items: string[];
  onSpinStart?: () => void;
  onLand: (item: string) => void;
  useLabel: string;
  onUse: () => void;
  canUse: boolean;
  showActions?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spinnerRef = useRef<Spinner | null>(null);
  const onLandRef = useRef(onLand);
  const itemsRef = useRef(items);

  useEffect(() => {
    onLandRef.current = onLand;
  }, [onLand]);

  useEffect(() => {
    if (!containerRef.current) return;
    const spinner = new Spinner({
      container: containerRef.current,
      items: itemsRef.current,
      itemHeight: isPhoneWidth() ? 72 : 110,
      windowHeight: isPhoneWidth() ? 216 : 330,
      fontSize: isPhoneWidth() ? "0.85rem" : "0.95rem",
      color: "#000000",
      accent: "#135248",
      onLand: (item) => onLandRef.current(item),
    });
    spinnerRef.current = spinner;
    return () => {
      spinner.destroy();
      spinnerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (itemsRef.current === items) return;
    itemsRef.current = items;
    spinnerRef.current?.setItems(items);
  }, [items]);

  const spin = () => {
    const spinner = spinnerRef.current;
    if (!spinner || spinner.isSpinning) return;
    onSpinStart?.();
    spinner.spin();
  };

  return (
    <div className="topic-spinner-card">
      <div ref={containerRef} />
      {showActions ? <SpinnerActions onSpin={spin} useLabel={useLabel} onUse={onUse} canUse={canUse} /> : null}
    </div>
  );
}

function shuffled<T>(items: T[]) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Several physics reels in their own cards for draws that need more than one prompt. The reels
// land on distinct items, one after another, and Spin/continue sit under all the cards.
// With onSelect, a landed card can be clicked to choose it. Short one-word prompts can sit
// side by side with layout="row"; sentences stay stacked. With spinEach, every card gets its own
// Spin button (colored by tones) and only the continue button sits under the cards; headings
// put a step heading over each card and split the cards with a dashed line.
// Choosing groups (onSelect) collapse each card to just its landed prompt, with pickPrompt above.
export function TopicSpinnerGroup({
  count,
  items,
  layout = "stack",
  labels,
  headings,
  tones,
  spinEach = false,
  onSpinStart,
  onLand,
  canSpin = true,
  useLabel,
  onUse,
  canUse,
  selectedValue,
  onSelect,
  pickPrompt,
}: {
  count: number;
  items: string[];
  layout?: "stack" | "row";
  labels?: string[];
  headings?: React.ReactNode[];
  tones?: SpinnerTone[];
  spinEach?: boolean;
  onSpinStart?: () => void;
  onLand: (results: string[]) => void;
  canSpin?: boolean;
  useLabel: string;
  onUse: () => void;
  canUse: boolean;
  selectedValue?: string;
  onSelect?: (item: string) => void;
  pickPrompt?: string;
}) {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const spinnersRef = useRef<Spinner[]>([]);
  const resultsRef = useRef<string[]>([]);
  const onLandRef = useRef(onLand);
  const itemsRef = useRef(items);
  // Tones and spinEach are fixed per use, so the reels are only rebuilt when the count changes.
  const setupRef = useRef({ tones, spinEach });
  const [results, setResults] = useState<string[]>([]);
  const [spinningCards, setSpinningCards] = useState<boolean[]>([]);
  const spinning = spinningCards.some(Boolean);

  useEffect(() => {
    onLandRef.current = onLand;
  }, [onLand]);

  useEffect(() => {
    const spinners = containerRefs.current.slice(0, count).flatMap((container, index) => {
      if (!container) return [];
      return [
        new Spinner({
          container,
          items: itemsRef.current,
          itemHeight: isPhoneWidth() ? 60 : 84,
          windowHeight: isPhoneWidth() ? 150 : 210,
          fontSize: isPhoneWidth() ? "0.82rem" : "0.9rem",
          color: "#000000",
          accent: TONE_ACCENTS[setupRef.current.tones?.[index] ?? "green"],
          // One tick track is enough; the last reel spins longest, so its ticks cover the draw.
          sound: setupRef.current.spinEach || index === count - 1,
          onLand: (item) => {
            resultsRef.current[index] = item;
            const landed = resultsRef.current.slice(0, count);
            setResults(landed);
            setSpinningCards((current) => current.map((value, i) => (i === index ? false : value)));
            if (landed.filter(Boolean).length < count || spinnersRef.current.some((spinner) => spinner.isSpinning)) return;
            onLandRef.current(landed);
          },
        }),
      ];
    });
    spinnersRef.current = spinners;
    return () => {
      spinners.forEach((spinner) => spinner.destroy());
      spinnersRef.current = [];
    };
  }, [count]);

  useEffect(() => {
    if (itemsRef.current === items) return;
    itemsRef.current = items;
    spinnersRef.current.forEach((spinner) => spinner.setItems(items));
  }, [items]);

  const spin = () => {
    const spinners = spinnersRef.current;
    if (spinning || !spinners.length || spinners.some((spinner) => spinner.isSpinning)) return;
    const targets = shuffled(Array.from(new Set(itemsRef.current))).slice(0, spinners.length);
    resultsRef.current = [];
    setResults([]);
    setSpinningCards(spinners.map(() => true));
    onSpinStart?.();
    spinners.forEach((spinner, index) => spinner.spin(24 + index * 6, targets[index]));
  };

  // Spins one card, steering clear of whatever the other cards already show.
  const spinOne = (index: number) => {
    const spinner = spinnersRef.current[index];
    if (!spinner || spinner.isSpinning) return;
    const taken = new Set(resultsRef.current.filter((result, i) => i !== index && result));
    const options = Array.from(new Set(itemsRef.current)).filter((item) => !taken.has(item));
    const target = shuffled(options)[0];
    resultsRef.current[index] = "";
    setResults(resultsRef.current.slice(0, count));
    setSpinningCards((current) => Array.from({ length: count }, (_, i) => (i === index ? true : Boolean(current[i]))));
    onSpinStart?.();
    spinner.spin(24, target);
  };

  const landed = !spinning && results.filter(Boolean).length === count;

  const collapsed = Boolean(onSelect && landed);

  return (
    <>
      {collapsed && pickPrompt ? <p className="topic-spinner-pick">{pickPrompt}</p> : null}
      <div className={`topic-spinner-group ${layout} ${headings ? "split" : ""}`} style={{ "--spinner-count": count } as React.CSSProperties}>
        {Array.from({ length: count }, (_, index) => {
          const result = results[index];
          const selectable = Boolean(onSelect && landed && result);
          const selected = Boolean(selectedValue && result === selectedValue);
          const card = (
            <div
              key={index}
              className={`topic-spinner-card compact ${tones?.[index] ? `tone-${tones[index]}` : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""} ${collapsed ? "collapsed" : ""}`}
              role={selectable ? "button" : undefined}
              tabIndex={selectable ? 0 : undefined}
              aria-pressed={selectable ? selected : undefined}
              onClick={selectable ? () => onSelect?.(result) : undefined}
              onKeyDown={
                selectable
                  ? (event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onSelect?.(result);
                    }
                  : undefined
              }
            >
              {labels?.[index] ? <span className="topic-spinner-label">{labels[index]}</span> : null}
              <div ref={(element) => { containerRefs.current[index] = element; }} />
              {collapsed ? <strong className="topic-spinner-result">{result}</strong> : null}
              {spinEach && canSpin ? (
                <button className="topic-spinner-spin card-spin" type="button" onClick={() => spinOne(index)} disabled={Boolean(spinningCards[index])}>
                  {SPIN_ICON}
                  Spin
                </button>
              ) : null}
            </div>
          );
          if (!headings) return card;
          return (
            <div className="topic-spinner-side" key={index}>
              <p className="eyebrow step-heading">{headings[index]}</p>
              {card}
            </div>
          );
        })}
      </div>
      <SpinnerActions onSpin={spin} canSpin={!spinEach} spinDisabled={spinning || !canSpin} spinLabel={count > 1 ? "Spin all" : "Spin"} useLabel={useLabel} onUse={onUse} canUse={canUse && landed} />
    </>
  );
}
