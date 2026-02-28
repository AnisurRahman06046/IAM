import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isPlatformAdmin } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isPlatformAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p>You need the <code>platform_admin</code> role to access the Admin Portal.</p>
      </div>
    );
  }

  return <>{children}</>;
}
