"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

// PLAN.md 1.4 — the receipt. Reverse-chronological, states visible,
// provenance intact, one-tap confirm, one-word hint. Nothing else.

// Mirrors lib/resolve/types.ts ItemState — backend truth, not a client
// guess: "resolving"/"retrying" are written by the server while the
// pipeline runs, and a run that exhausts its retries lands explicitly in
// "needs_hint" (see markResolutionFailed in lib/items.ts) rather than the
// UI inferring a stall from elapsed time.
type ItemState =
  | "raw"
  | "resolving"
  | "retrying"
  | "resolved"
  | "needs_confirm"
  | "needs_hint"
  | "confirmed";

const IN_FLIGHT_STATES: ItemState[] = ["raw", "resolving", "retrying"];

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
  metadata: { resolution_failed?: boolean } | null;
  created_at: string;
  captures: Capture | Capture[] | null;
};

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

export default function Receipt() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hintOpenId, setHintOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(false);
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
    // load() is async — every setState inside it happens after an await,
    // never synchronously within the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Poll while the backend reports work in flight (raw/resolving/retrying)
  // — never a client-side timeout. The pipeline itself is what decides an
  // item is done trying and flips it to needs_hint; the UI just reflects
  // that. pollCount is purely a runaway-request guard, not a truth claim.
  useEffect(() => {
    const inFlight = (items ?? []).some((i) => IN_FLIGHT_STATES.includes(i.state));
    if (!inFlight || pollCount.current > 60) return;
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

  // The zero-artifact capture path (PLAN.md 1.5): type a recommendation, it
  // is stored instantly and resolves in the background. The whole text goes
  // as one payload — the T2 extractor parses "— from priya" itself, so no
  // separate who field is needed. Returns success so the form can clear.
  async function addCapture(text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;
    setAdding(true);
    setAddError(false);
    try {
      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload_type: "text",
          payload: trimmed,
          source: "manual",
        }),
      });
      if (!res.ok) throw new Error();
      pollCount.current = 0; // resume polling so the new raw item resolves
      await load();
      return true;
    } catch {
      setAddError(true);
      return false;
    } finally {
      setAdding(false);
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

      <QuickAdd adding={adding} error={addError} onAdd={addCapture} />

      {loadError && (
        <p className={styles.notice}>
          Couldn&apos;t load your captures. Check the connection and reload.
        </p>
      )}

      {items && items.length === 0 && !loadError && (
        <p className={styles.notice}>
          Nothing caught yet. Type a recommendation above — even something
          half-remembered — and it&apos;ll resolve here, with who it&apos;s from.
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

function QuickAdd({
  adding,
  error,
  onAdd,
}: {
  adding: boolean;
  error: boolean;
  onAdd: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className={styles.quickAdd}
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onAdd(text);
        if (ok) setText("");
      }}
    >
      <div className={styles.quickAddRow}>
        <input
          className={styles.quickAddInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a recommendation — e.g. dark netflix — from priya"
          aria-label="Add a recommendation"
          autoComplete="off"
          enterKeyHint="done"
          disabled={adding}
        />
        <button
          type="submit"
          className={styles.confirmBtn}
          disabled={adding || !text.trim()}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
      {error && (
        <p className={styles.quickAddError}>
          Couldn&apos;t save that — check the connection and try again.
        </p>
      )}
    </form>
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

        {item.state === "raw" && (
          <p className={styles.stateQuiet}>Caught. Starting to identify…</p>
        )}

        {item.state === "resolving" && (
          <p className={styles.stateQuiet}>Identifying…</p>
        )}

        {item.state === "retrying" && (
          <p className={styles.stateQuiet}>
            Having trouble reaching the identification service — retrying…
          </p>
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

        {(item.state === "needs_hint" ||
          (item.state === "needs_confirm" && hintOpen)) && (
          <HintForm
            label={
              item.state === "needs_confirm"
                ? "One word that identifies it"
                : item.metadata?.resolution_failed
                  ? "Couldn’t reach the identification service — a word can restart it"
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
