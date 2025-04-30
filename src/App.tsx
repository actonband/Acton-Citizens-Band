import React, { useState, useEffect } from "react";
import "./App.scss";
import { InstrumentLoadingProvider } from './components/instruments/InstrumentLoadingContext';
import Main from "./components/Main";
import { AuthProvider, useAuth } from "./components/auth/AuthContext";
import googleAnalytics from "./utils/GoogleAnalytics";
import { firestore } from "./utils/Firebase";
import { collection,getDocs, query } from "firebase/firestore"; 

export type Feature = {
  name: string,
  key: number,
  enabled: boolean
};

const App: React.FC = () => {
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [features, setFeatures] = useState<Feature[]>([]);

  useEffect(() => {
    const handleResize = () => {
      setHeaderHeight(document.getElementById("header")?.clientHeight ?? 0);
    };

    handleResize();

    window.addEventListener("resize", handleResize);
    
    const fetchFeatures = async (): Promise<Feature[]> => {
      try {
        const features: Feature[] = [];
      
        const q = query(collection(firestore, "features"));
        const snapshot = await getDocs(q);
      
        let index = 0;
      
        snapshot.forEach((feature) => {
          features.push({ name: feature.id, key: index++, ...feature.data() } as Feature);
        });
      
        return features;
      } catch (error) {
        console.error("Error fetching features:", error);
        return [];
      }
    };

    fetchFeatures().then((features) => setFeatures(features));

    googleAnalytics.initGoogleAnalytics();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <AuthProvider>
      <InstrumentLoadingProvider>
        <div id="app" className="app">
          <Header features={features}/>
          <Main headerHeight={headerHeight} features={features} />
          <Footer features={features}/>
        </div>
      </InstrumentLoadingProvider>
    </AuthProvider>
  );
};

const Header: React.FC<{ features: Feature[] }> = ({ features }) => {
  return (
    <header id="header" className="header">
      <div className="header-top">
        <div className="header-text-container">
          <div className="header-text">Acton Citizens&#39; Band</div>
        </div>
      </div>
      <Nav features={features}/>
    </header>
  );
};

const Nav: React.FC<{ features: Feature[] }> = ({ features }) => {
  return (
    <nav id="nav" className="nav">
      <ul>
        <li className="nav-list-item" key="about">
          <a href="#about">About</a>
        </li>
        <li className="nav-list-item" key="learn">
          <a href="#learn">Learn</a>
        </li>
        <li className="nav-list-item" key="join">
          <a href="#join">Join</a>
        </li>
        <li className="nav-list-item" key="events">
          <a href="#events">Events</a>
        </li>
        { features.some(f => f.name === 'history' 
            && f.enabled === true) && (
            <li className="nav-list-item" key="history">
              <a href="#history">History</a>
            </li>
          )
        }
        { features.some(f => f.name === 'account' 
            && f.enabled === true) && (
            <li className="nav-list-item" key="account">
              <a href="#account">Account</a>
            </li>
          )
        }
      </ul>
    </nav>
  );
};

const Footer: React.FC<{ features: Feature[] }> = ({ features }) => {
  return (
    <footer id="footer" className="footer">
      <div className="footer-content">
        <div className="footer-logos">
          <a href="https://www.facebook.com/ActonBand/" target="_BLANK"><img className="social-media-logo" src="/img/Facebook.svg" alt="Facebook Logo" /></a>
          <a href="https://www.instagram.com/actonband" target="_BLANK"><img className="social-media-logo" src="/img/Instagram.svg" alt="Instagram Logo" /></a>
          { features.some(f => f.name === 'x' 
            && f.enabled === true) && (<a href="https://x.com/actonband" target="_BLANK"><img className="social-media-logo" src="/img/X.svg" alt="X.com Logo" /></a>)
          }
        </div>
        <div className="footer-text">
          <a href="https://skfb.ly/UTHx" target="_BLANK">"Trumpet"</a> by Charlie Tinley is licensed under <a href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution</a>
        </div>
        <div className="footer-text">
          <a href="https://brianmorris.info" target="_BLANK">Website by Brian Morris</a>
        </div>
      </div>
    </footer>
  );
};

export default App;
