import React from "react";
import type { Feature } from "../utils/features";
import Home from "./home/HomePage";

type MainProps = {
  headerHeight: number;
  features: Feature[];
};

const Main: React.FC<MainProps> = ({ headerHeight, features }) => {
  return (
    <main id="main" className="main" style={{ marginTop: `${headerHeight * 1.1}px` }}>
      <h1 className="visually-hidden">Acton Citizens' Band</h1>
      <Home headerHeight={headerHeight} features={features} />
    </main>
  );
};

export default Main;
