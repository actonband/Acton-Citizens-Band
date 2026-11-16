import { useEffect, useRef, useState } from "react";
import { trackEvent } from "../utils/analytics";

export default function ThemeToggle({
  className = "theme-toggle",
  showLabel = false,
}: { className?: string; showLabel?: boolean } = {}) {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light",
  );
  const hasOverride = useRef(false);
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = (next: "light" | "dark") => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    const sync = () => {
      let saved = null;
      try {
        saved = localStorage.getItem("acb-theme");
      } catch {
        // Theme selection still works when storage is blocked.
      }
      hasOverride.current = saved === "light" || saved === "dark";
      apply(saved === "light" || saved === "dark" ? saved : preference?.matches ? "dark" : "light");
    };
    const followDevice = () => {
      if (!hasOverride.current) apply(preference?.matches ? "dark" : "light");
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === "acb-theme" || event.key === null) sync();
    };
    sync();
    preference?.addEventListener("change", followDevice);
    window.addEventListener("storage", syncStorage);
    return () => {
      preference?.removeEventListener("change", followDevice);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={className}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        hasOverride.current = true;
        document.documentElement.dataset.theme = next;
        setTheme(next);
        trackEvent("theme_change", { theme: next });
        try {
          localStorage.setItem("acb-theme", next);
        } catch {
          // Keep the selected theme for this page without storage.
        }
      }}
    >
      <span
        className={`theme-icon theme-icon-${theme === "dark" ? "sun" : "moon"}`}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="theme-label">{next === "dark" ? "Dark Mode" : "Light Mode"}</span>
      )}
    </button>
  );
}
