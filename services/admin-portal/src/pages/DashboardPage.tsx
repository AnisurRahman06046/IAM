import React, { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Typography, Spin, message } from "antd";
import {
  AppstoreOutlined,
  TeamOutlined,
  UserOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { platformApi, type PlatformStats } from "../api/platform";

const { Title } = Typography;

export function DashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    platformApi
      .getStats()
      .then(setStats)
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;
  }

  return (
    <>
      <Title level={4}>Dashboard</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Products"
              value={stats?.totalProducts ?? 0}
              prefix={<AppstoreOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Tenants"
              value={stats?.totalTenants ?? 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Active Tenants"
              value={stats?.activeTenants ?? 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: "#3f8600" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Users"
              value={stats?.totalUsers ?? 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
