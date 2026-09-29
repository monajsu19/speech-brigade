"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "./lib/spinner";

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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            <path d="M20 3v4" />
            <path d="M22 5h-4" />
            <path d="M4 17v2" />
            <path d="M5 18H3" />
          </svg>
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
      itemHeight: 110,
      windowHeight: 330,
      fontSize: "0.95rem",
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
// side by side with layout="row"; sentences stay stacked.
export function TopicSpinnerGroup({
  count,
  items,
  layout = "stack",
  labels,
  onSpinStart,
  onLand,
  canSpin = true,
  useLabel,
  onUse,
  canUse,
  selectedValue,
  onSelect,
}: {
  count: number;
  items: string[];
  layout?: "stack" | "row";
  labels?: string[];
  onSpinStart?: () => void;
  onLand: (results: string[]) => void;
  canSpin?: boolean;
  useLabel: string;
  onUse: () => void;
  canUse: boolean;
  selectedValue?: string;
  onSelect?: (item: string) => void;
}) {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const spinnersRef = useRef<Spinner[]>([]);
  const resultsRef = useRef<string[]>([]);
  const onLandRef = useRef(onLand);
  const itemsRef = useRef(items);
  const [results, setResults] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);

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
          itemHeight: 84,
          windowHeight: 210,
          fontSize: "0.9rem",
          color: "#000000",
          accent: "#135248",
          // One tick track is enough; the last reel spins longest, so its ticks cover the draw.
          sound: index === count - 1,
          onLand: (item) => {
            resultsRef.current[index] = item;
            if (resultsRef.current.filter(Boolean).length < count) return;
            const landed = resultsRef.current.slice(0, count);
            setResults(landed);
            setSpinning(false);
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
    setSpinning(true);
    onSpinStart?.();
    spinners.forEach((spinner, index) => spinner.spin(24 + index * 6, targets[index]));
  };

  const landed = !spinning && results.length === count;

  return (
    <>
      <div className={`topic-spinner-group ${layout}`} style={{ "--spinner-count": count } as React.CSSProperties}>
        {Array.from({ length: count }, (_, index) => {
          const result = results[index];
          const selectable = Boolean(onSelect && landed && result);
          const selected = Boolean(selectedValue && result === selectedValue);
          return (
            <div
              key={index}
              className={`topic-spinner-card compact ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
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
            </div>
          );
        })}
      </div>
      <SpinnerActions onSpin={spin} canSpin={canSpin} spinDisabled={spinning} spinLabel={count > 1 ? "Spin all" : "Spin"} useLabel={useLabel} onUse={onUse} canUse={canUse && landed} />
    </>
  );
}
