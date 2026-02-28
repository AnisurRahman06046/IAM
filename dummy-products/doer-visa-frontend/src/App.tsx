import React, { useState, useEffect } from "react";
import { AuthProvider } from "./auth/auth-context";
import { getAccessToken } from "./auth/token-storage";
import { LoginPage } from "./pages/LoginPage";
import { CallbackPage } from "./pages/CallbackPage";
import { DashboardPage } from "./pages/DashboardPage";

function Router() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  // If we're on /callback with a code param (Keycloak redirect), show CallbackPage
  if (window.location.pathname === "/callback" && window.location.search.includes("code=")) {
    return <CallbackPage />;
  }

  switch (route) {
    case "dashboard":
      return <DashboardPage />;
    case "login":
    default:
      // Auto-redirect to dashboard if already authenticated
      if (getAccessToken()) {
        window.location.hash = "#/dashboard";
        return <DashboardPage />;
      }
      return <LoginPage />;
  }
}

function getRoute(): string {
  const hash = window.location.hash.replace("#/", "");
  return hash || "login";
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
