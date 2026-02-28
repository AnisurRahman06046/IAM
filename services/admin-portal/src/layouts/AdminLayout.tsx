import React from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Button, Typography, theme } from "antd";
import {
  DashboardOutlined,
  AppstoreOutlined,
  TeamOutlined,
  AuditOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { useAuth } from "../auth/auth-context";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "/products", icon: <AppstoreOutlined />, label: "Products" },
  { key: "/tenants", icon: <TeamOutlined />, label: "Tenants" },
  { key: "/audit", icon: <AuditOutlined />, label: "Audit Logs" },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { token: themeToken } = theme.useToken();

  const selectedKey = menuItems.find(
    (item) => item.key !== "/" && location.pathname.startsWith(item.key),
  )?.key || "/";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={220} theme="dark">
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <Text strong style={{ color: "#fff", fontSize: 18 }}>
            Doer Admin
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: themeToken.colorBgContainer,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 16,
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          }}
        >
          <Text type="secondary">{user?.email}</Text>
          <Button icon={<LogoutOutlined />} onClick={logout} size="small">
            Logout
          </Button>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
