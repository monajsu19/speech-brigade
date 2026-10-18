"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { TopicSpinner } from "./TopicSpinner";

export type MyTopicEvent = "impromptu" | "extemp";

interface UserTopic {
  id: string;
  text: string;
  created_at: string;
}

// Matches the user_topics table's own checks, so the app and database agree on the limits.
const TOPIC_CHAR_LIMIT = 200;
const TOPIC_COUNT_LIMIT = 50;

// How long Clear All can be undone.
const UNDO_MS = 8000;

type ModalView =
  | { kind: "list" }
  | { kind: "edit"; topic: UserTopic | null }
  | { kind: "bulk" }
  | { kind: "delete"; topic: UserTopic }
  | { kind: "clear" };

type TopicSeparator = "newline" | "comma" | "tab" | "custom";

const SEPARATOR_OPTIONS: { value: TopicSeparator; label: string }[] = [
  { value: "newline", label: "New line" },
  { value: "comma", label: "Comma" },
  { value: "tab", label: "Tab" },
  { value: "custom", label: "Other…" },
];

function separatorPlaceholder(separator: TopicSeparator, custom: string, noun: string) {
  const items = [`First ${noun}`, `Second ${noun}`, `Third ${noun}`];
  if (separator === "comma") return items.join(", ");
  if (separator === "tab") return items.join("\t");
  if (separator === "custom" && custom) return items.join(` ${custom} `);
  return items.join("\n");
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits a pasted list on the chosen separator. Line breaks always split too, so a comma or tab
// list pasted over several lines still works. Bullets and numbering ("-", "•", "1.", "2)") are
// dropped, and blank entries, repeats, and topics already saved are skipped.
function parseTopicList(pasted: string, existing: string[], separator: TopicSeparator, custom: string) {
  const extra =
    separator === "comma" ? "," : separator === "tab" ? "\t" : separator === "custom" && custom ? custom : "";
  const splitter = new RegExp(extra ? `\\r?\\n|${escapeRegExp(extra)}` : "\\r?\\n");
  const seen = new Set(existing.map((text) => text.toLowerCase()));
  const fresh: string[] = [];
  let tooLong = 0;
  for (const line of pasted.split(splitter)) {
    const text = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!text) continue;
    if (text.length > TOPIC_CHAR_LIMIT) {
      tooLong += 1;
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(text);
  }
  return { fresh, tooLong };
}

const PENCIL_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
  </svg>
);

const TRASH_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

// "My Topic" tab on the Impromptu and Extemp setup pages: people write their own topics (for
// example, themes a tournament announced ahead of time) and spin through them.
export function MyTopics({
  event,
  onSpinStart,
  onUse,
}: {
  event: MyTopicEvent;
  onSpinStart?: () => void;
  onUse: (topic: string) => void;
}) {
  const [topics, setTopics] = useState<UserTopic[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [landed, setLanded] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [modal, setModal] = useState<ModalView | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [bulkDraft, setBulkDraft] = useState("");
  const [separator, setSeparator] = useState<TopicSeparator>("newline");
  const [customSeparator, setCustomSeparator] = useState("");
  // Topics removed by Clear All, kept until the Undo window closes.
  const [cleared, setCleared] = useState<UserTopic[] | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const loadTopics = useCallback(async () => {
    if (!supabase) {
      setLoadStatus("error");
      return;
    }
    const { data, error } = await supabase
      .from("user_topics")
      .select("id, text, created_at")
      .eq("event", event)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadStatus("error");
      return;
    }
    setTopics(data || []);
    setLoadStatus("ready");
  }, [event]);

  useEffect(() => {
    // Loading runs after paint, so the first render shows the loading line.
    const timer = window.setTimeout(() => void loadTopics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTopics]);

  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }, []);

  const openModal = (view: ModalView) => {
    setModalError("");
    if (view.kind === "edit") setDraft(view.topic?.text || "");
    if (view.kind === "bulk") setBulkDraft("");
    setModal(view);
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setModalError("");
  };

  const saveTopic = async () => {
    if (!supabase || modal?.kind !== "edit") return;
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    setModalError("");
    const { error } = modal.topic
      ? await supabase.from("user_topics").update({ text }).eq("id", modal.topic.id)
      : await supabase.from("user_topics").insert({ event, text });
    setSaving(false);
    if (error) {
      setModalError(
        error.message.includes("user_topics_cap_exceeded")
          ? `You've reached the ${TOPIC_COUNT_LIMIT}-topic limit.`
          : "That topic couldn't be saved. Try again.",
      );
      return;
    }
    await loadTopics();
    setModal({ kind: "list" });
  };

  const deleteTopic = async () => {
    if (!supabase || modal?.kind !== "delete") return;
    setSaving(true);
    setModalError("");
    const { error } = await supabase.from("user_topics").delete().eq("id", modal.topic.id);
    setSaving(false);
    if (error) {
      setModalError("That topic couldn't be deleted. Try again.");
      return;
    }
    await loadTopics();
    setModal({ kind: "list" });
  };

  const topicTexts = useMemo(() => topics.map((topic) => topic.text), [topics]);
  const atLimit = topics.length >= TOPIC_COUNT_LIMIT;
  const slotsLeft = TOPIC_COUNT_LIMIT - topics.length;
  const bulk = parseTopicList(bulkDraft, topicTexts, separator, customSeparator);
  const bulkAdding = bulk.fresh.slice(0, slotsLeft);
  const bulkOverCap = bulk.fresh.length - bulkAdding.length;

  const addTopicList = async () => {
    if (!supabase || modal?.kind !== "bulk" || !bulkAdding.length) return;
    setSaving(true);
    setModalError("");
    // Inserted in reverse so the list reads in pasted order, newest first.
    const { error } = await supabase.from("user_topics").insert(bulkAdding.slice().reverse().map((text) => ({ event, text })));
    setSaving(false);
    if (error) {
      setModalError(
        error.message.includes("user_topics_cap_exceeded")
          ? `You've reached the ${TOPIC_COUNT_LIMIT}-topic limit.`
          : "Those topics couldn't be saved. Try again.",
      );
      return;
    }
    await loadTopics();
    setModal({ kind: "list" });
  };

  const clearAll = async () => {
    if (!supabase || modal?.kind !== "clear") return;
    const removed = topics;
    setSaving(true);
    setModalError("");
    const { error } = await supabase.from("user_topics").delete().eq("event", event);
    setSaving(false);
    if (error) {
      setModalError("Your topics couldn't be cleared. Try again.");
      return;
    }
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    setCleared(removed);
    undoTimerRef.current = window.setTimeout(() => setCleared(null), UNDO_MS);
    setLanded("");
    await loadTopics();
    setModal({ kind: "list" });
  };

  // Puts the cleared topics back with their original dates, so they keep their order.
  const undoClear = async () => {
    if (!supabase || !cleared) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    const restoring = cleared;
    setCleared(null);
    const { error } = await supabase
      .from("user_topics")
      .insert(restoring.map((topic) => ({ event, text: topic.text, created_at: topic.created_at })));
    if (error) setLoadStatus("error");
    await loadTopics();
  };

  return (
    <div className="my-topics">
      <button className="my-topics-new" type="button" disabled={spinning} onClick={() => openModal({ kind: "list" })}>
        + New
      </button>
      {loadStatus === "loading" ? (
        <p className="my-topics-status">Loading your topics…</p>
      ) : loadStatus === "error" ? (
        <p className="my-topics-status error">
          Your topics couldn&apos;t be loaded.{" "}
          <button type="button" className="text-button" onClick={() => void loadTopics()}>
            Try again
          </button>
        </p>
      ) : topics.length === 0 ? (
        <div className="my-topics-empty">
          <button className="primary" type="button" onClick={() => openModal({ kind: "edit", topic: null })}>
            + Add a topic
          </button>
          <button className="text-button my-topics-paste-link" type="button" onClick={() => openModal({ kind: "bulk" })}>
            or paste a list
          </button>
        </div>
      ) : (
        <TopicSpinner
          // A fresh reel whenever the list changes, so the topic it shows always still exists.
          key={topics.map((topic) => topic.id).join(",")}
          items={topicTexts}
          landInitial
          onSpinStart={() => {
            setSpinning(true);
            onSpinStart?.();
          }}
          onLand={(topic) => {
            setLanded(topic);
            setSpinning(false);
          }}
          useLabel="Use this topic"
          onUse={() => onUse(landed)}
          canUse={Boolean(landed) && topicTexts.includes(landed) && !spinning}
        />
      )}
      {modal ? (
        <div className="founders-modal-backdrop my-topics-backdrop" role="presentation" onMouseDown={closeModal}>
          <section
            className="my-topics-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="my-topics-title"
            onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
          >
            <div className="my-topics-modal-head">
              <h2 id="my-topics-title">My Topics</h2>
              <button className="my-topics-close" type="button" onClick={closeModal} aria-label="Close My Topics">
                ×
              </button>
            </div>
            {modal.kind === "list" ? (
              <>
                <div className="my-topics-toolbar">
                  <span className="my-topics-count">
                    {topics.length} / {TOPIC_COUNT_LIMIT}
                  </span>
                  <div className="my-topics-toolbar-actions">
                    {topics.length ? (
                      <button className="my-topics-clear" type="button" onClick={() => openModal({ kind: "clear" })}>
                        Clear all
                      </button>
                    ) : null}
                    <button
                      className="my-topics-cancel small"
                      type="button"
                      disabled={atLimit}
                      title={atLimit ? `You've hit the ${TOPIC_COUNT_LIMIT}-topic cap` : undefined}
                      onClick={() => openModal({ kind: "bulk" })}
                    >
                      Paste list
                    </button>
                    <button
                      className="my-topics-new small"
                      type="button"
                      disabled={atLimit}
                      title={atLimit ? `You've hit the ${TOPIC_COUNT_LIMIT}-topic cap` : undefined}
                      onClick={() => openModal({ kind: "edit", topic: null })}
                    >
                      + New
                    </button>
                  </div>
                </div>
                {topics.length === 0 ? (
                  <p className="my-topics-list-empty">You haven&apos;t created any topics yet. Tap &ldquo;New&rdquo; to add one.</p>
                ) : (
                  <ul className="my-topics-list">
                    {topics.map((topic) => (
                      <li key={topic.id}>
                        <span>{topic.text}</span>
                        <button type="button" aria-label="Edit topic" onClick={() => openModal({ kind: "edit", topic })}>
                          {PENCIL_ICON}
                        </button>
                        <button type="button" className="delete" aria-label="Delete topic" onClick={() => openModal({ kind: "delete", topic })}>
                          {TRASH_ICON}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : modal.kind === "edit" ? (
              <div className="my-topics-form">
                <textarea
                  rows={5}
                  autoFocus
                  maxLength={TOPIC_CHAR_LIMIT}
                  placeholder={event === "extemp" ? "Type your question here…" : "Type your topic here…"}
                  value={draft}
                  onChange={(changeEvent) => setDraft(changeEvent.target.value)}
                />
                <span className="my-topics-count">
                  {draft.length} / {TOPIC_CHAR_LIMIT}
                </span>
                {modalError ? <p className="my-topics-error">{modalError}</p> : null}
                <div className="my-topics-actions">
                  <button className="my-topics-cancel" type="button" disabled={saving} onClick={() => openModal({ kind: "list" })}>
                    Cancel
                  </button>
                  <button className="my-topics-save" type="button" disabled={!draft.trim() || saving} onClick={() => void saveTopic()}>
                    {saving ? "Saving…" : modal.topic ? "Save" : "Create"}
                  </button>
                </div>
              </div>
            ) : modal.kind === "bulk" ? (
              <div className="my-topics-form">
                <div className="my-topics-separator">
                  <label htmlFor="my-topics-separator">Separate topics by</label>
                  <select
                    id="my-topics-separator"
                    value={separator}
                    onChange={(changeEvent) => setSeparator(changeEvent.target.value as TopicSeparator)}
                  >
                    {SEPARATOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {separator === "custom" ? (
                    <input
                      type="text"
                      aria-label="Separator"
                      placeholder="e.g. ;"
                      maxLength={10}
                      value={customSeparator}
                      onChange={(changeEvent) => setCustomSeparator(changeEvent.target.value)}
                    />
                  ) : null}
                </div>
                <textarea
                  rows={8}
                  autoFocus
                  placeholder={separatorPlaceholder(separator, customSeparator, event === "extemp" ? "question" : "topic")}
                  value={bulkDraft}
                  onChange={(changeEvent) => setBulkDraft(changeEvent.target.value)}
                />
                <span className="my-topics-count">
                  {bulkAdding.length} new {bulkAdding.length === 1 ? "topic" : "topics"}
                  {bulkOverCap ? ` · ${bulkOverCap} over the ${TOPIC_COUNT_LIMIT}-topic limit` : ""}
                  {bulk.tooLong ? ` · ${bulk.tooLong} over ${TOPIC_CHAR_LIMIT} characters` : ""}
                </span>
                {modalError ? <p className="my-topics-error">{modalError}</p> : null}
                <div className="my-topics-actions">
                  <button className="my-topics-cancel" type="button" disabled={saving} onClick={() => openModal({ kind: "list" })}>
                    Cancel
                  </button>
                  <button className="my-topics-save" type="button" disabled={!bulkAdding.length || saving} onClick={() => void addTopicList()}>
                    {saving ? "Adding…" : bulkAdding.length ? `Add ${bulkAdding.length} ${bulkAdding.length === 1 ? "topic" : "topics"}` : "Add topics"}
                  </button>
                </div>
              </div>
            ) : modal.kind === "clear" ? (
              <div className="my-topics-form">
                <p>Clear all {topics.length} topics?</p>
                <p className="my-topics-count">You&apos;ll have a few seconds to undo.</p>
                {modalError ? <p className="my-topics-error">{modalError}</p> : null}
                <div className="my-topics-actions">
                  <button className="my-topics-cancel" type="button" disabled={saving} onClick={() => openModal({ kind: "list" })}>
                    Cancel
                  </button>
                  <button className="my-topics-delete" type="button" disabled={saving} onClick={() => void clearAll()}>
                    {saving ? "Clearing…" : "Clear all"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="my-topics-form">
                <p>Delete this topic?</p>
                <p className="my-topics-quote">&ldquo;{modal.topic.text}&rdquo;</p>
                {modalError ? <p className="my-topics-error">{modalError}</p> : null}
                <div className="my-topics-actions">
                  <button className="my-topics-cancel" type="button" disabled={saving} onClick={() => openModal({ kind: "list" })}>
                    Cancel
                  </button>
                  <button className="my-topics-delete" type="button" disabled={saving} onClick={() => void deleteTopic()}>
                    {saving ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
      {cleared ? (
        <div className="my-topics-undo" role="status">
          <span>
            Cleared {cleared.length} {cleared.length === 1 ? "topic" : "topics"}.
          </span>
          <button type="button" onClick={() => void undoClear()}>
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
