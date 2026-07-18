"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

// PLAN.md 1.4 — the receipt. Reverse-chronological, states visible,
// provenance intact, one-tap confirm, one-word hint. Nothing else.

type ItemState = "raw" | "resolved" | "needs_confirm" | "needs_hint" | "confirmed";

type Capture = {
  payload_type: "url" | "text" | "image";
  payload_text: string | null;
  source: string;
  captured_at: string;
};

type Item = {
  id: string;
  state: ItemState;
  title: string | null;
  year: number | null;
  media_type: "movie" | "tv" | null;
  poster_ref: string | null;
  confidence: number | null;
  who: string | null;
  created_at: string;
  captures: Capture | Capture[] | null;
};

const STALL_MS = 90_000;

function captureOf(item: Item): Capture | null {
  if (!item.captures) return null;
  return Array.isArray(item.captures) ? item.captures[0] : item.captures;
}

function sourceLabel(source: string): string | null {
  switch (source) {
    case "instagram":
      return "Instagram";
    case "whatsapp":
      return "WhatsApp";
    case "web":
      return "Web";
    case "manual":
      return "Typed";
    default:
      return null;
  }
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

function isStalled(item: Item): boolean {
  return (
    item.state === "raw" &&
    Date.now() - new Date(item.created_at).getTime() > STALL_MS
  );
}

export default function Receipt() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hintOpenId, setHintOpenId] = useState<string | null>(null);
  const pollCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: Item[] };
      setItems(data.items);
      setLoadError(false);
      return data.items;
    } catch {
      setLoadError(true);
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while something is still identifying, so raw flips to its real
  // state in front of the user. Bounded: stalled items stop the clock.
  useEffect(() => {
    const identifying = (items ?? []).some(
      (i) => i.state === "raw" && !isStalled(i)
    );
    if (!identifying || pollCount.current > 15) return;
    const t = setTimeout(() => {
      pollCount.current += 1;
      load();
    }, 4000);
    return () => clearTimeout(t);
  }, [items, load]);

  async function confirm(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/items/${id}/confirm`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function sendHint(id: string, hint: string) {
    if (!hint.trim()) return;
    setBusyId(id);
    try {
      await fetch(`/api/items/${id}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hint: hint.trim() }),
      });
      setHintOpenId(null);
      pollCount.current = 0;
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.wordmark}>Seelay</h1>
        {items && items.length > 0 && (
          <span className={styles.count}>
            {items.length} {items.length === 1 ? "capture" : "captures"}
          </span>
        )}
      </header>

      {loadError && (
        <p className={styles.notice}>
          Couldn&apos;t load your captures. Check the connection and reload.
        </p>
      )}

      {items && items.length === 0 && !loadError && (
        <p className={styles.notice}>
          Nothing caught yet. Captures appear here the moment they&apos;re
          made — resolved, with who recommended them.
        </p>
      )}

      <ul className={styles.list}>
        {(items ?? []).map((item) => (
          <Row
            key={item.id}
            item={item}
            busy={busyId === item.id}
            hintOpen={hintOpenId === item.id}
            onConfirm={() => confirm(item.id)}
            onOpenHint={() => setHintOpenId(item.id)}
            onSendHint={(hint) => sendHint(item.id, hint)}
          />
        ))}
      </ul>
    </main>
  );
}

function Row({
  item,
  busy,
  hintOpen,
  onConfirm,
  onOpenHint,
  onSendHint,
}: {
  item: Item;
  busy: boolean;
  hintOpen: boolean;
  onConfirm: () => void;
  onOpenHint: () => void;
  onSendHint: (hint: string) => void;
}) {
  const capture = captureOf(item);
  const stalled = isStalled(item);
  const identified = item.state === "resolved" || item.state === "confirmed";
  const provenance = [
    item.who ? `from ${item.who}` : null,
    capture ? sourceLabel(capture.source) : null,
    capture ? dateLabel(capture.captured_at) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className={styles.row}>
      <div className={styles.poster}>
        {item.poster_ref ? (
          <Image
            src={`https://image.tmdb.org/t/p/w92${item.poster_ref}`}
            alt=""
            width={48}
            height={72}
            className={styles.posterImg}
          />
        ) : (
          <div className={styles.posterBlank} aria-hidden="true" />
        )}
      </div>

      <div className={styles.body}>
        {item.title ? (
          <p className={styles.title}>
            {item.title}
            <span className={styles.titleMeta}>
              {item.year ? ` ${item.year}` : ""}
              {item.media_type
                ? ` · ${item.media_type === "tv" ? "Series" : "Movie"}`
                : ""}
            </span>
          </p>
        ) : (
          <p className={styles.titleUnknown}>Not identified yet</p>
        )}

        {provenance && <p className={styles.provenance}>{provenance}</p>}

        {capture?.payload_text && (
          <p className={styles.original} title={capture.payload_text}>
            {capture.payload_type === "url" ? (
              <a
                href={capture.payload_text}
                target="_blank"
                rel="noreferrer"
                className={styles.originalLink}
              >
                {capture.payload_text}
              </a>
            ) : (
              `“${capture.payload_text}”`
            )}
          </p>
        )}

        {/* State slot — the one place rows differ. */}
        {identified && (
          <p className={styles.stateQuiet}>
            {item.state === "confirmed"
              ? "Confirmed by you"
              : `Matched · ${Math.round((item.confidence ?? 0) * 100)}%`}
          </p>
        )}

        {item.state === "raw" && !stalled && (
          <p className={styles.stateQuiet}>Identifying…</p>
        )}

        {item.state === "needs_confirm" && (
          <div className={styles.actions}>
            <span className={styles.stateAsk}>Is this the one?</span>
            <button
              className={styles.confirmBtn}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "Confirming…" : "Yes, confirm"}
            </button>
            {!hintOpen && (
              <button className={styles.quietBtn} onClick={onOpenHint}>
                No — add a hint
              </button>
            )}
          </div>
        )}

        {(item.state === "needs_hint" || stalled || (item.state === "needs_confirm" && hintOpen)) && (
          <HintForm
            label={
              item.state === "needs_confirm"
                ? "One word that identifies it"
                : stalled
                  ? "Identification stalled — a word can restart it"
                  : "Couldn’t identify this yet — one word helps"
            }
            busy={busy}
            onSubmit={onSendHint}
          />
        )}
      </div>
    </li>
  );
}

function HintForm({
  label,
  busy,
  onSubmit,
}: {
  label: string;
  busy: boolean;
  onSubmit: (hint: string) => void;
}) {
  const [hint, setHint] = useState("");
  return (
    <form
      className={styles.hintForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(hint);
      }}
    >
      <p className={styles.stateAsk}>{label}</p>
      <div className={styles.hintRow}>
        <input
          className={styles.hintInput}
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="e.g. the title, a year, the language"
          aria-label="Hint"
          disabled={busy}
        />
        <button
          type="submit"
          className={styles.confirmBtn}
          disabled={busy || !hint.trim()}
        >
          {busy ? "Trying…" : "Try"}
        </button>
      </div>
    </form>
  );
}
