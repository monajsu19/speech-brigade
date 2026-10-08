"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { TopicSpinner } from "./TopicSpinner";

export type MyTopicEvent = "impromptu" | "extemp";

interface UserTopic {
  id: string;
  text: string;
}

// Matches the user_topics table's own checks, so the app and database agree on the limits.
const TOPIC_CHAR_LIMIT = 200;
const TOPIC_COUNT_LIMIT = 50;

type ModalView = { kind: "list" } | { kind: "edit"; topic: UserTopic | null } | { kind: "delete"; topic: UserTopic };

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

  const loadTopics = useCallback(async () => {
    if (!supabase) {
      setLoadStatus("error");
      return;
    }
    const { data, error } = await supabase
      .from("user_topics")
      .select("id, text")
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

  const openModal = (view: ModalView) => {
    setModalError("");
    if (view.kind === "edit") setDraft(view.topic?.text || "");
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

  const topicTexts = topics.map((topic) => topic.text);
  const atLimit = topics.length >= TOPIC_COUNT_LIMIT;

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
          <h2>No topics yet</h2>
          <p>Add your own topics, like the themes announced before a tournament, and spin through them anytime.</p>
          <button className="primary" type="button" onClick={() => openModal({ kind: "edit", topic: null })}>
            + Create your first topic
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
    </div>
  );
}
