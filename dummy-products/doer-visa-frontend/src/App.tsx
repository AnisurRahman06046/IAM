import React, { useState, useEffect } from "react";
import { AuthProvider } from "./auth/auth-context";
import { getAccessToken } from "./auth/token-storage";
import { LoginPage } from "./pages/LoginPage";
import { CallbackPage } from "./pages/CallbackPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { ProfilePage } from "./pages/ProfilePage";

function Router() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  // Handle Keycloak PKCE callback
  if (window.location.pathname === "/callback" && window.location.search.includes("code=")) {
    return <CallbackPage />;
  }

  // Require auth for all non-login routes
  if (route !== "login" && !getAccessToken()) {
    window.location.hash = "#/login";
    return <LoginPage />;
  }

  // Auto-redirect to dashboard if already authenticated
  if (route === "login" && getAccessToken()) {
    window.location.hash = "#/dashboard";
    return <DashboardPage />;
  }

  switch (route) {
    case "dashboard":
      return <DashboardPage />;
    case "applications":
      return <ApplicationsPage />;
    case "profile":
      return <ProfilePage />;
    case "login":
      return <LoginPage />;
    default:
      return <DashboardPage />;
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
