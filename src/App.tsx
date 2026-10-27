import React, { useState, useEffect, useRef } from "react";
import "./App.scss";
import { InstrumentLoadingProvider } from "./components/instruments/InstrumentLoadingContext";
import { DeviceOrientationProvider } from "./components/instruments/DeviceOrientationContext";
import Main from "./components/Main";
import { AuthProvider } from "./components/auth/AuthContext";
import googleAnalytics from "./utils/GoogleAnalytics";
import { isAccountEnabled, parseFeature } from "./utils/features";
import { firestore } from "./utils/Firebase";
import { collection, getDocs, query } from "firebase/firestore";

import type { Feature } from "./utils/features";

const App: React.FC = () => {
  const headerHeight = 0;
  const [features, setFeatures] = useState<Feature[]>([]);

  useEffect(() => {
    const fetchFeatures = async (): Promise<Feature[]> => {
      try {
        const features: Feature[] = [];

        const q = query(collection(firestore, "features"));
        const snapshot = await getDocs(q);

        snapshot.forEach((feature) => {
          features.push(parseFeature(feature.id, feature.data()));
        });

        return features;
      } catch (error) {
        console.error("Error fetching features:", error);
        return [];
      }
    };

    let active = true;
    fetchFeatures().then((features) => {
      if (active) setFeatures(features);
    });

    googleAnalytics.initGoogleAnalytics();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AuthProvider>
      <InstrumentLoadingProvider>
        <DeviceOrientationProvider>
          <div id="app" className="app">
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <Header features={features} />
            <BandLogo className="page-logo" />
            <Main headerHeight={headerHeight} features={features} />
            <Footer features={features} />
          </div>
        </DeviceOrientationProvider>
      </InstrumentLoadingProvider>
    </AuthProvider>
  );
};

const BandLogo: React.FC<{ className: string }> = ({ className }) => (
  <a className={className} href="#app" aria-label="Acton Citizens' Band home">
    <img
      src="/img/branding/ACB-Logo-Red-Transparent.svg"
      alt="Acton Citizens' Band"
      width="96"
      height="96"
    />
  </a>
);

const Header: React.FC<{ features: Feature[] }> = ({ features }) => {
  const [logoPassed, setLogoPassed] = useState(false);

  useEffect(() => {
    const logo = document.querySelector(".page-logo img");
    if (!logo) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setLogoPassed(entry.boundingClientRect.bottom <= 64);
      },
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(logo);
    return () => observer.disconnect();
  }, []);

  return (
    <header id="header" className="header">
      <Nav features={features} showBrand={logoPassed} />
    </header>
  );
};

const Nav: React.FC<{ features: Feature[]; showBrand: boolean }> = ({ features, showBrand }) => {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light",
  );
  const hasThemeOverride = useRef(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("acb-theme");
      hasThemeOverride.current = saved === "light" || saved === "dark";
    } catch {
      /* Follow the device preference without storage. */
    }
    if (!window.matchMedia) return;
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const followDevice = () => {
      if (hasThemeOverride.current) return;
      const next = preference.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    followDevice();
    preference.addEventListener("change", followDevice);
    return () => preference.removeEventListener("change", followDevice);
  }, []);
  const toggleTheme = () => {
    hasThemeOverride.current = true;
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("acb-theme", next);
    } catch {
      /* Theme works without storage. */
    }
  };
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !navRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    const updateActive = () => {
      const headings = Array.from(document.querySelectorAll<HTMLElement>(".section-content[id]"));
      const current = headings
        .filter((heading) => heading.getBoundingClientRect().top <= window.innerHeight * 0.4)
        .pop();
      setActive(current?.id ?? "");
    };
    updateActive();
    window.addEventListener("scroll", updateActive, { passive: true });
    return () => window.removeEventListener("scroll", updateActive);
  }, []);

  return (
    <nav
      ref={navRef}
      id="nav"
      className={`nav ${open ? "nav-open" : ""}`}
      aria-label="Main navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          navRef.current?.querySelector("button")?.focus();
        }
      }}
    >
      <div className="scroll-brand-slot">
        <a
          className={`scroll-brand ${showBrand ? "scroll-brand-visible" : ""}`}
          href="#app"
          aria-hidden={!showBrand}
          tabIndex={showBrand ? 0 : -1}
          onClick={() => setOpen(false)}
        >
          ACTON CITIZENS' BAND
        </a>
      </div>
      <button
        className="menu-toggle"
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="navigation-links"
        onClick={() => setOpen(!open)}
      >
        <img src="/img/icons/Menu.svg" alt="" width="28" height="28" />
      </button>
      <ul id="navigation-links" onClick={() => setOpen(false)}>
        <li className="nav-list-item" key="about">
          <a href="#about" aria-current={active === "about" ? "location" : undefined}>
            About
          </a>
        </li>
        <li className="nav-list-item" key="learn">
          <a href="#learn" aria-current={active === "learn" ? "location" : undefined}>
            Learn
          </a>
        </li>
        <li className="nav-list-item" key="join">
          <a href="#join" aria-current={active === "join" ? "location" : undefined}>
            Join
          </a>
        </li>
        <li className="nav-list-item" key="events">
          <a href="#events" aria-current={active === "events" ? "location" : undefined}>
            Events
          </a>
        </li>
        {features.some((f) => f.name === "history" && f.enabled === true) && (
          <li className="nav-list-item" key="history">
            <a href="#history" aria-current={active === "history" ? "location" : undefined}>
              History
            </a>
          </li>
        )}
        {isAccountEnabled(features) && (
          <li className="nav-list-item" key="account">
            <a href="#account" aria-current={active === "account" ? "location" : undefined}>
              Account
            </a>
          </li>
        )}
        <li className="nav-list-item theme-menu-item">
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <span
              className={`theme-icon theme-icon-${theme === "dark" ? "sun" : "moon"}`}
              aria-hidden="true"
            />
            <span className="theme-label">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
};

const Footer: React.FC<{ features: Feature[] }> = ({ features }) => {
  return (
    <footer id="footer" className="footer">
      <div className="footer-content">
        <div className="footer-logos">
          <a href="https://www.facebook.com/ActonBand/" target="_blank" rel="noopener noreferrer">
            <img className="social-media-logo" src="/img/icons/Facebook.svg" alt="Facebook Logo" />
          </a>
          <a href="https://www.instagram.com/actonband" target="_blank" rel="noopener noreferrer">
            <img
              className="social-media-logo"
              src="/img/icons/Instagram.svg"
              alt="Instagram Logo"
            />
          </a>
          {features.some((f) => f.name === "x" && f.enabled === true) && (
            <a href="https://x.com/actonband" target="_blank" rel="noopener noreferrer">
              <img className="social-media-logo" src="/img/icons/X.svg" alt="X.com Logo" />
            </a>
          )}
        </div>
        <div className="footer-text">
          <a href="https://skfb.ly/UTHx" target="_blank" rel="noopener noreferrer">
            "Trumpet"
          </a>{" "}
          by Charlie Tinley is licensed under{" "}
          <a href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution</a>
        </div>
        <div className="footer-text">
          <a href="https://brianmorris.info" target="_blank" rel="noopener noreferrer">
            Website by Brian Morris
          </a>
        </div>
      </div>
    </footer>
  );
};

export default App;
