import { createRoot } from "react-dom/client";
import { AuthProvider } from "./components/auth/AuthContext";
import Dashboard from "./components/dashboard/Dashboard";
import ResetPassword from "./components/auth/ResetPassword";
import VerifyEmail from "./components/auth/VerifyEmail";
import "./components/dashboard/Dashboard.scss";

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    new URLSearchParams(location.search).get("mode") === "resetPassword" ? (
      <ResetPassword />
    ) : new URLSearchParams(location.search).get("mode") === "verifyEmail" ? (
      <VerifyEmail />
    ) : (
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    ),
  );
