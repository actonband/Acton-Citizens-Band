import React from "react";
import { Feature } from "../App";
import { Routes, Route } from "react-router-dom";
import Home from "./home/HomePage";
import SignInForm from "./auth/SignInForm";
// import PublicPage from "./components/PublicPage";
// import Dashboard from "./components/Dashboard";
// import AdminEvents from "./components/admin/AdminEvents";


type MainProps = {
  headerHeight: number,
  features: Feature[]
};

const Main: React.FC<MainProps> = ({ headerHeight, features }) => { 
  return ( 
    <main 
      id="main" 
      className="main" 
      style={{ marginTop: `${headerHeight * 1.1}px` }} 
    >
      <Home 
        headerHeight={headerHeight} 
        features={features} 
      /> 
    </main> 
  ); 
}; 

export default Main; 
