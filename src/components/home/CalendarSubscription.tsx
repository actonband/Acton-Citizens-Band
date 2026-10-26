import React, { useEffect, useId, useRef, useState } from "react";
import GoogleAnalyticsLink from "../../utils/GoogleAnalyticsLink";
import { copyText } from "../../utils/copyText";
import { calendarFeedUrl, calendarProviders, CalendarProvider, getDefaultCalendarProvider } from "../../utils/calendarSubscription";

const CalendarSubscription: React.FC = () => {
  const [provider, setProvider] = useState<CalendarProvider>(() => getDefaultCalendarProvider(typeof navigator === "undefined" ? {} : navigator));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const selected = calendarProviders[provider];
  const providers = [provider, ...Object.keys(calendarProviders).filter((key) => key !== provider)] as CalendarProvider[];

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (manualCopy && open) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [manualCopy, open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const focusItem = (last = false) => {
    window.requestAnimationFrame(() => {
      const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items?.[last ? items.length - 1 : 0]?.focus();
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      toggleRef.current?.focus();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && event.target !== inputRef.current) {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        focusItem(event.key === "ArrowUp" || event.key === "End");
        return;
      }
      const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  };

  const copyLink = async () => {
    if (rootRef.current && await copyText(calendarFeedUrl, rootRef.current)) {
      setManualCopy(false);
      setCopied(true);
    } else {
      setCopied(false);
      setManualCopy(true);
      inputRef.current?.focus(); inputRef.current?.select();
    }
  };

  return (
    <div className="calendar-subscription" ref={rootRef} onKeyDown={handleKeyDown}
      onBlur={() => window.requestAnimationFrame(() => {
        if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
      })}>
      <div className="calendar-split-button">
        <GoogleAnalyticsLink eventName="Events_Calendar_Subscribe_Click" eventCategory="Link" eventLabel={provider}
          className={`button ${selected.className}`} href={selected.href}
          target={provider === "Apple" ? undefined : "_blank"} rel={provider === "Apple" ? undefined : "noopener noreferrer"}
          aria-label={`Add to Calendar: ${selected.label}`} title={selected.label} onClick={() => setOpen(false)}>
          <span className="button-icon" aria-hidden="true"></span>
          <span className="button-text">Add to Calendar</span>
        </GoogleAnalyticsLink>
        <button type="button" className="button calendar-dropdown-toggle" ref={toggleRef}
          aria-label="Choose calendar" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
          onClick={(event) => { setOpen(!open); if (!open && event.detail === 0) focusItem(); }}>
          <span className="calendar-dropdown-icon" aria-hidden="true"></span>
        </button>
      </div>
      {open && <div className="calendar-dropdown" id={menuId} role="menu" aria-label="Calendar options">
        {providers.map((key) => (
          <GoogleAnalyticsLink key={key} role="menuitem" tabIndex={-1}
            eventName="Events_Calendar_Subscribe_Click" eventCategory="Link" eventLabel={key}
            className={`calendar-option ${calendarProviders[key].className}`} href={calendarProviders[key].href}
            target={key === "Apple" ? undefined : "_blank"} rel={key === "Apple" ? undefined : "noopener noreferrer"}
            onClick={() => { setProvider(key); setOpen(false); }}>
            <span className="button-icon" aria-hidden="true"></span>
            <span>{calendarProviders[key].label}</span>
            {key === provider && <span className="calendar-option-check" aria-hidden="true"></span>}
          </GoogleAnalyticsLink>
        ))}
        <button type="button" role="menuitem" tabIndex={-1} className="calendar-option calendar-option-secondary" onClick={copyLink}>
          <span className="calendar-link-icon" aria-hidden="true" />
          <span role="status">{copied ? "Copied" : "Copy calendar link"}</span>
        </button>
        {manualCopy && <input className="calendar-copy-input" ref={inputRef} aria-label="Calendar subscription URL"
          readOnly value={calendarFeedUrl} onFocus={(event) => event.currentTarget.select()} />}
      </div>}
    </div>
  );
};

export default CalendarSubscription;
