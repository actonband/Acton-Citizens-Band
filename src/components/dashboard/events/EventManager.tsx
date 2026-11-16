import { trackDashboardAction } from "../../../utils/analytics";
import React, { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { firebaseAuth, firestore } from "../../../utils/firebase";
import {
  formatEventUpdated,
  groupDashboardEvents,
  parseEvent,
  validateEventLinks,
} from "../../../utils/events";
import { firestoreValuesEqual } from "../../../utils/firestoreValues";
import type { DashboardEventRecord as EventRecord } from "../../../utils/events";
import EventCard from "./EventCard";
import { manageUser } from "../users/adminUsers";

type Fields = {
  title: string;
  venue: string;
  address: string;
  description: string;
  members_note: string;
  start: string;
  end: string;
  cancelled: boolean;
  links: { id: string; text: string; url: string }[];
};
const empty: Fields = {
  title: "",
  venue: "",
  address: "",
  description: "",
  members_note: "",
  start: "",
  end: "",
  cancelled: false,
  links: [],
};

function inputDate(value: unknown): string {
  if (!(value instanceof Timestamp)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value.toDate());
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

// Reject nonexistent and ambiguous daylight-saving times instead of silently shifting them.
export function torontoTimestamp(value: string): Timestamp {
  const wall = Date.parse(value + "Z");
  const matches = [4, 5]
    .map((offset) => Timestamp.fromMillis(wall + offset * 3600000))
    .filter((candidate) => inputDate(candidate) === value);
  if (matches.length !== 1)
    throw new Error(
      "Choose a valid, unambiguous Toronto time outside the daylight-saving clock change.",
    );
  return matches[0];
}

export default function EventManager({ canEdit = false }: { canEdit?: boolean }) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [fields, setFields] = useState<Fields>(empty);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const titleInput = useRef<HTMLInputElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const lastLinkInput = useRef<HTMLInputElement>(null);
  const addLinkButton = useRef<HTMLButtonElement>(null);
  const [updatedBy, setUpdatedBy] = useState<{
    path: string;
    name: string;
    failed?: boolean;
  } | null>(null);
  const [updaterAttempt, setUpdaterAttempt] = useState(0);
  const editing = canEdit && editorOpen;
  const viewing = !editorOpen && selected !== null;
  const showMetadata = canEdit && (editing || viewing);
  const updaterPath = typeof selected?.data.user_id === "string" ? selected.data.user_id : "";
  const updaterId = updaterPath.match(/^\/?users\/([^/]+)$/)?.[1];

  useEffect(() => {
    if (!showMetadata || !updaterId) return;
    let active = true;
    void getDoc(doc(firestore, "users", updaterId))
      .then(async (snapshot) => {
        const data = snapshot.data();
        const name =
          typeof data?.display_name === "string" && data.display_name.trim()
            ? data.display_name.trim()
            : [data?.first_name, data?.last_name]
                .filter((part) => typeof part === "string")
                .join(" ")
                .trim();
        let resolvedName = name;
        if (!resolvedName) {
          try {
            const account = await manageUser({ action: "get", uid: updaterId });
            resolvedName = account.name.trim();
          } catch (failure) {
            if (
              !failure ||
              typeof failure !== "object" ||
              !("code" in failure) ||
              failure.code !== "functions/not-found"
            )
              throw failure;
          }
        }
        if (active) setUpdatedBy({ path: updaterPath, name: resolvedName || "Name unavailable" });
      })
      .catch(() => {
        if (active) setUpdatedBy({ path: updaterPath, name: "Unable to load name", failed: true });
      });
    return () => {
      active = false;
    };
  }, [showMetadata, updaterId, updaterPath, updaterAttempt]);

  useEffect(() => {
    if (canEdit) return;
    setEditorOpen(false);
    setSelected(null);
    setFields(empty);
    setDirty(false);
    setError("");
    setMessage("");
  }, [canEdit]);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const snapshot = await getDocs(collection(firestore, "events"));
      setEvents(snapshot.docs.map((item) => ({ id: item.id, data: item.data() })));
      setNow(new Date());
    } catch {
      setLoadError("Unable to load events. Use Refresh to retry.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (editing) titleInput.current?.focus();
    else if (viewing) detailHeading.current?.focus();
  }, [editing, viewing, selected?.id]);
  useEffect(() => {
    if (!dirty || !canEdit) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, canEdit]);

  function edit(record: EventRecord | null) {
    if (!canEdit) return;
    if (dirty && !confirm("Discard your unsaved event changes?")) return;
    const data = record?.data || {};
    const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
    setSelected(record);
    setFields({
      title: text("title"),
      venue: text("venue"),
      address: text("address"),
      description: text("description"),
      members_note: text("members_note"),
      start: inputDate(data.start),
      end: inputDate(data.end),
      cancelled: data.cancelled === true,
      links: Array.isArray(data.links)
        ? data.links
            .filter((link) => link && typeof link === "object")
            .map((link) => ({
              id: crypto.randomUUID(),
              text: typeof link.text === "string" ? link.text : "",
              url: typeof link.url === "string" ? link.url : "",
            }))
        : [],
    });
    setEditorOpen(true);
    setDirty(false);
    setError("");
    setMessage("");
  }
  function view(record: EventRecord) {
    setSelected(record);
    setEditorOpen(false);
    setError("");
    setMessage("");
  }
  function cancelEdit() {
    if (!selected) {
      closeEditor();
      return;
    }
    if (dirty && !confirm("Discard your unsaved event changes?")) return;
    setEditorOpen(false);
    setFields(empty);
    setDirty(false);
    setError("");
  }
  function closeEditor() {
    if (dirty && !confirm("Discard your unsaved event changes?")) return;
    setEditorOpen(false);
    setSelected(null);
    setFields(empty);
    setDirty(false);
    setError("");
    requestAnimationFrame(() => listHeading.current?.focus());
  }
  function change<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const actor = firebaseAuth.currentUser;
      if (!actor) throw new Error("Sign in again before saving this event.");
      const start = torontoTimestamp(fields.start);
      const end = fields.end ? torontoTimestamp(fields.end) : null;
      if (end && end.toMillis() < start.toMillis())
        throw new Error("End time must follow the start time.");
      const links = validateEventLinks(fields.links);
      const data = {
        title: fields.title.trim(),
        venue: fields.venue.trim(),
        address: fields.address.trim(),
        description: fields.description.trim(),
        members_note: fields.members_note.trim(),
        cancelled: fields.cancelled,
        start,
        end,
        links,
        updated: serverTimestamp(),
        user_id: `/users/${actor.uid}`,
      };
      const reference = selected
        ? doc(firestore, "events", selected.id)
        : doc(collection(firestore, "events"));
      await runTransaction(firestore, async (transaction) => {
        const current = await transaction.get(reference);
        if (selected && (!current.exists() || !firestoreValuesEqual(current.data(), selected.data)))
          throw new Error(
            "This event changed since you opened it. Refresh and reopen it before saving.",
          );
        if (!selected && current.exists())
          throw new Error("Unable to create this event. Please retry.");
        transaction.set(reference, data, { merge: true });
      });
      setDirty(false);
      trackDashboardAction(selected ? "event_save" : "event_create", "success");
      setSelected(null);
      setFields(empty);
      setEditorOpen(false);
      setMessage("Event saved. The public list will use these changes on its next load.");
      await load();
      requestAnimationFrame(() => listHeading.current?.focus());
    } catch (error) {
      trackDashboardAction(selected ? "event_save" : "event_create", "error");
      setError(
        error instanceof Error
          ? error.message
          : "Unable to save the event. Check your permissions and retry.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const groups = groupDashboardEvents(events, now);
  return (
    <section>
      <div className="profile-title-row">
        <h2 ref={viewing ? detailHeading : listHeading} tabIndex={-1}>
          {editing
            ? selected
              ? "Edit Event"
              : "New Event"
            : viewing
              ? "Event Details"
              : canEdit
                ? "Manage Events"
                : "Events"}
        </h2>
        <div className="dashboard-actions dashboard-toolbar">
          {viewing && canEdit && (
            <button
              className="dashboard-primary-button"
              disabled={busy}
              onClick={() => edit(selected)}
            >
              Edit Event
            </button>
          )}
          {editing || viewing ? (
            <button className="dashboard-secondary-button" disabled={busy} onClick={closeEditor}>
              Back To Events
            </button>
          ) : (
            <>
              <button
                className="dashboard-secondary-button"
                disabled={busy || loading}
                onClick={() => void load()}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
              {canEdit && (
                <button
                  className="dashboard-primary-button"
                  disabled={busy || loading}
                  onClick={() => edit(null)}
                >
                  New Event
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {!editing && !viewing && (
        <>
          {loading && <p role="status">Loading events…</p>}
          {loadError && <p role="alert">{loadError}</p>}
          {!loading && !loadError && events.length === 0 && (
            <p>
              {canEdit
                ? "No events yet. Create your first event with New event."
                : "No events yet."}
            </p>
          )}
          {(
            [
              ["Upcoming Events", groups.upcoming, false],
              ["Past Events", groups.past, true],
              [canEdit ? "Needs a Date" : "Date Not Set", groups.undated, false],
            ] as const
          ).map(
            ([heading, records, compact]) =>
              records.length > 0 && (
                <div className="event-group" key={heading}>
                  <h3>{heading}</h3>
                  <div className="event-card-list">
                    {records.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        compact={compact}
                        disabled={busy || loading}
                        onView={() => view(event)}
                      />
                    ))}
                  </div>
                </div>
              ),
          )}
        </>
      )}
      {showMetadata && (
        <dl className="profile-summary event-update-summary">
          <div>
            <dt>Updated</dt>
            <dd>
              {selected
                ? formatEventUpdated(selected.data.updated)
                : "Set when this event is saved"}
            </dd>
          </div>
          <div>
            <dt>Updated By</dt>
            <dd>
              {!selected
                ? "Set when this event is saved"
                : updatedBy?.path === updaterPath
                  ? updatedBy.name
                  : updaterId
                    ? "Loading name…"
                    : "Not recorded"}
              {updatedBy?.path === updaterPath && updatedBy.failed && (
                <button
                  type="button"
                  className="dashboard-secondary-button"
                  onClick={() => {
                    setUpdatedBy(null);
                    setUpdaterAttempt((value) => value + 1);
                  }}
                >
                  Retry Name
                </button>
              )}
            </dd>
          </div>
        </dl>
      )}
      {viewing && (
        <EventCard event={{ ...selected, details: parseEvent(selected.id, selected.data) }} />
      )}
      {editing && (
        <form className="event-edit-form" onSubmit={save} data-dirty={dirty}>
          <fieldset disabled={busy}>
            {(["title", "venue", "address"] as const).map((key) => (
              <label key={key} className={key === "title" ? "event-field-full" : undefined}>
                {key === "title" ? "Event Title" : key === "venue" ? "Venue" : "Address"}
                <input
                  ref={key === "title" ? titleInput : undefined}
                  required={key === "title"}
                  maxLength={500}
                  value={fields[key]}
                  onChange={(event) => change(key, event.target.value)}
                />
              </label>
            ))}
            <p className="event-field-full dashboard-auth-note">
              All dates and times use the America/Toronto timezone.
            </p>
            <label>
              Start
              <input
                type="datetime-local"
                required
                value={fields.start}
                onChange={(event) => change("start", event.target.value)}
              />
            </label>
            <label>
              End (Optional)
              <input
                type="datetime-local"
                value={fields.end}
                onChange={(event) => change("end", event.target.value)}
              />
            </label>
            <label className="event-field-full">
              Description
              <textarea
                maxLength={10000}
                value={fields.description}
                onChange={(event) => change("description", event.target.value)}
              />
            </label>
            <label className="event-field-full">
              Member Note (Visible Publicly)
              <textarea
                maxLength={10000}
                value={fields.members_note}
                onChange={(event) => change("members_note", event.target.value)}
              />
            </label>
            <div
              className="event-field-full event-links-editor"
              role="group"
              aria-labelledby="event-links-heading"
            >
              <h3 id="event-links-heading">Links</h3>
              {fields.links.length === 0 && <p className="dashboard-auth-note">No links added.</p>}
              {fields.links.map((link, index) => (
                <fieldset key={link.id} className="event-link-row">
                  <legend>Link {index + 1}</legend>
                  <label>
                    Label
                    <input
                      ref={index === fields.links.length - 1 ? lastLinkInput : undefined}
                      aria-label={`Link ${index + 1} label`}
                      value={link.text}
                      required={!!link.url.trim()}
                      placeholder="More Information"
                      onChange={(event) =>
                        change(
                          "links",
                          fields.links.map((item) =>
                            item.id === link.id ? { ...item, text: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    URL
                    <input
                      type="url"
                      aria-label={`Link ${index + 1} URL`}
                      value={link.url}
                      required={!!link.text.trim()}
                      placeholder="https://example.com"
                      autoCapitalize="none"
                      spellCheck={false}
                      onChange={(event) =>
                        change(
                          "links",
                          fields.links.map((item) =>
                            item.id === link.id ? { ...item, url: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="dashboard-secondary-button"
                    aria-label={`Remove link ${index + 1}`}
                    onClick={() => {
                      change(
                        "links",
                        fields.links.filter((item) => item.id !== link.id),
                      );
                      requestAnimationFrame(() => addLinkButton.current?.focus());
                    }}
                  >
                    Remove
                  </button>
                </fieldset>
              ))}
              <button
                ref={addLinkButton}
                type="button"
                className="dashboard-secondary-button"
                disabled={fields.links.length >= 20}
                onClick={() => {
                  if (fields.links.length >= 20) return;
                  change("links", [
                    ...fields.links,
                    { id: crypto.randomUUID(), text: "", url: "" },
                  ]);
                  requestAnimationFrame(() => lastLinkInput.current?.focus());
                }}
              >
                Add Link
              </button>
              {fields.links.length >= 20 && (
                <p className="dashboard-auth-note">
                  Maximum of 20 links. Remove a link to add another.
                </p>
              )}
            </div>
            <label className="event-field-full event-cancelled-field">
              <input
                type="checkbox"
                checked={fields.cancelled}
                onChange={(event) => change("cancelled", event.target.checked)}
              />
              Cancelled
            </label>
            <div className="dashboard-actions event-field-full">
              <button className="dashboard-primary-button">
                {busy ? "Saving…" : selected ? "Save Event" : "Create Event"}
              </button>
              <button type="button" className="dashboard-secondary-button" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
