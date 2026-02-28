import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Descriptions, Typography, Tag, Button, Spin, message } from "antd";
import { tenantsApi, type Tenant } from "../../api/tenants";

const { Title } = Typography;

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    tenantsApi
      .get(id)
      .then(setTenant)
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !tenant) {
    return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;
  }

  return (
    <>
      <Button onClick={() => navigate("/tenants")} style={{ marginBottom: 16 }}>
        Back
      </Button>
      <Title level={4}>{tenant.name}</Title>
      <Descriptions bordered column={2}>
        <Descriptions.Item label="Name">{tenant.name}</Descriptions.Item>
        <Descriptions.Item label="Alias">{tenant.alias}</Descriptions.Item>
        <Descriptions.Item label="Product">{tenant.product}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={tenant.status === "active" ? "green" : "default"}>
            {tenant.status}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Plan">{tenant.plan}</Descriptions.Item>
        <Descriptions.Item label="Max Users">{tenant.maxUsers}</Descriptions.Item>
        <Descriptions.Item label="Billing Email">
          {tenant.billingEmail || "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Domain">{tenant.domain || "-"}</Descriptions.Item>
        <Descriptions.Item label="Members">
          {tenant.memberCount ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Keycloak Org ID">
          <code>{tenant.keycloakOrgId}</code>
        </Descriptions.Item>
        <Descriptions.Item label="Created">
          {new Date(tenant.createdAt).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="Updated">
          {new Date(tenant.updatedAt).toLocaleString()}
        </Descriptions.Item>
      </Descriptions>
    </>
  );
}
