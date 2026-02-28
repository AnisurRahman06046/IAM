import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Typography, Space } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useAuth } from "../auth/auth-context";

const { Title, Text } = Typography;

export function LoginPage() {
  const { isAuthenticated, isPlatformAdmin, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && isPlatformAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isPlatformAdmin, navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%)",
      }}
    >
      <Card style={{ width: 400, textAlign: "center" }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <LockOutlined style={{ fontSize: 48, color: "#1e3a5f" }} />
          <Title level={3} style={{ margin: 0 }}>
            Doer Admin Portal
          </Title>
          <Text type="secondary">
            Platform administration for Doer IAM products
          </Text>
          <Button type="primary" size="large" block onClick={login}>
            Sign In with Keycloak
          </Button>
        </Space>
      </Card>
    </div>
  );
}
