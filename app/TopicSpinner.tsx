"use client";

import { useEffect, useRef } from "react";
import { Spinner } from "./lib/spinner";

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
      {showActions ? (
        <div className="topic-spinner-actions">
          <button className="topic-spinner-spin" type="button" onClick={spin}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              <path d="M20 3v4" />
              <path d="M22 5h-4" />
              <path d="M4 17v2" />
              <path d="M5 18H3" />
            </svg>
            Spin
          </button>
          <button className="topic-spinner-use" type="button" onClick={onUse} disabled={!canUse}>
            {useLabel}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
