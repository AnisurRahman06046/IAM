import React from "react";
import { Routes, Route } from "react-router-dom";
import { ConfigProvider } from "antd";
import { AuthProvider } from "./auth/auth-context";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { CallbackPage } from "./pages/CallbackPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductListPage } from "./pages/products/ProductListPage";
import { ProductCreatePage } from "./pages/products/ProductCreatePage";
import { ProductDetailPage } from "./pages/products/ProductDetailPage";
import { TenantListPage } from "./pages/tenants/TenantListPage";
import { TenantCreatePage } from "./pages/tenants/TenantCreatePage";
import { TenantDetailPage } from "./pages/tenants/TenantDetailPage";
import { AuditLogPage } from "./pages/audit/AuditLogPage";

export function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1e3a5f",
          borderRadius: 6,
        },
      }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/products" element={<ProductListPage />} />
            <Route path="/products/new" element={<ProductCreatePage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/tenants" element={<TenantListPage />} />
            <Route path="/tenants/new" element={<TenantCreatePage />} />
            <Route path="/tenants/:id" element={<TenantDetailPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ConfigProvider>
  );
}
