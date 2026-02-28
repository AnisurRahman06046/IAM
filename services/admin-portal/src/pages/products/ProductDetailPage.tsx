import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Typography,
  Tabs,
  Descriptions,
  Tag,
  Button,
  Spin,
  message,
  Popconfirm,
  Space,
  Table,
  Input,
  Modal,
  Form,
  Switch,
  Select,
} from "antd";
import {
  productsApi,
  type Product,
  type ClientRole,
  type Tenant,
} from "../../api/products";

const { Title, Text } = Typography;

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [roles, setRoles] = useState<ClientRole[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [routeConfig, setRouteConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProduct = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      productsApi.get(id),
      productsApi.getRoles(id).catch(() => []),
      productsApi.getTenants(id).catch(() => []),
      productsApi.getRoute(id).catch(() => null),
    ])
      .then(([p, r, t, route]) => {
        setProduct(p);
        setRoles(r);
        setTenants(t);
        setRouteConfig(route);
      })
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(fetchProduct, [id]);

  if (loading || !product) {
    return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;
  }

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate("/products")}>Back</Button>
        <Title level={4} style={{ margin: 0 }}>
          {product.name}
        </Title>
        <Tag color={product.status === "active" ? "green" : "default"}>
          {product.status}
        </Tag>
      </Space>

      <Tabs
        items={[
          {
            key: "overview",
            label: "Overview",
            children: (
              <OverviewTab product={product} onDeactivate={fetchProduct} />
            ),
          },
          {
            key: "roles",
            label: "Roles",
            children: (
              <RolesTab
                productId={product.id}
                roles={roles}
                onRefresh={fetchProduct}
              />
            ),
          },
          {
            key: "route",
            label: "Route Config",
            children: (
              <RouteTab
                productId={product.id}
                config={routeConfig}
                hasRoute={!!product.apisixRouteId}
                onRefresh={fetchProduct}
              />
            ),
          },
          {
            key: "tenants",
            label: `Tenants (${tenants.length})`,
            children: <TenantsTab tenants={tenants} />,
          },
        ]}
      />
    </>
  );
}

// ─── Overview Tab ─────────────────────────────────────────

function OverviewTab({
  product,
  onDeactivate,
}: {
  product: Product;
  onDeactivate: () => void;
}) {
  const handleDeactivate = async () => {
    try {
      await productsApi.deactivate(product.id);
      message.success("Product deactivated");
      onDeactivate();
    } catch (err: unknown) {
      message.error((err as Error).message);
    }
  };

  return (
    <>
      <Descriptions bordered column={2}>
        <Descriptions.Item label="Name">{product.name}</Descriptions.Item>
        <Descriptions.Item label="Slug">{product.slug}</Descriptions.Item>
        <Descriptions.Item label="Description">
          {product.description || "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={product.status === "active" ? "green" : "default"}>
            {product.status}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Frontend URL">
          {product.frontendUrl || "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Backend">
          {product.backendUrl && product.backendPort
            ? `${product.backendUrl}:${product.backendPort}`
            : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="KC Public Client">
          {product.kcPublicClientId || "-"}
        </Descriptions.Item>
        <Descriptions.Item label="KC Backend Client">
          {product.kcBackendClientId || "-"}
        </Descriptions.Item>
        <Descriptions.Item label="APISIX Route">
          {product.apisixRouteId || "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Created">
          {new Date(product.createdAt).toLocaleString()}
        </Descriptions.Item>
      </Descriptions>
      {product.status === "active" && (
        <Popconfirm
          title="Deactivate this product?"
          onConfirm={handleDeactivate}
        >
          <Button danger style={{ marginTop: 16 }}>
            Deactivate Product
          </Button>
        </Popconfirm>
      )}
    </>
  );
}

// ─── Roles Tab ────────────────────────────────────────────

function RolesTab({
  productId,
  roles,
  onRefresh,
}: {
  productId: string;
  roles: ClientRole[];
  onRefresh: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<"permission" | "role">("permission");
  const [showComposites, setShowComposites] = useState<string | null>(null);
  const [composites, setComposites] = useState<ClientRole[]>([]);
  const [form] = Form.useForm();
  const [compositeForm] = Form.useForm();

  const permissionsList = roles.filter((r) => !r.composite);
  const rolesList = roles.filter((r) => r.composite);

  const handleCreate = async (values: { name: string; description?: string }) => {
    try {
      await productsApi.createRole(productId, {
        ...values,
        composite: createType === "role",
      });
      message.success(`${createType === "role" ? "Role" : "Permission"} "${values.name}" created`);
      setShowCreate(false);
      form.resetFields();
      onRefresh();
    } catch (err: unknown) {
      message.error((err as Error).message);
    }
  };

  const handleDelete = async (roleName: string) => {
    try {
      await productsApi.deleteRole(productId, roleName);
      message.success(`"${roleName}" deleted`);
      onRefresh();
    } catch (err: unknown) {
      message.error((err as Error).message);
    }
  };

  const openComposites = async (roleName: string) => {
    setShowComposites(roleName);
    try {
      const c = await productsApi.getComposites(productId, roleName);
      setComposites(c);
    } catch {
      setComposites([]);
    }
  };

  const handleAddComposites = async (values: { roleNames: string[] }) => {
    if (!showComposites) return;
    try {
      await productsApi.addComposites(productId, showComposites, values.roleNames);
      message.success("Permissions added to role");
      compositeForm.resetFields();
      openComposites(showComposites);
      onRefresh();
    } catch (err: unknown) {
      message.error((err as Error).message);
    }
  };

  const permColumns = [
    { title: "Permission", dataIndex: "name", key: "name", render: (v: string) => <Tag color="green">{v}</Tag> },
    { title: "Description", dataIndex: "description", key: "description", render: (v: string) => v || "-" },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_: unknown, record: ClientRole) => (
        <Popconfirm title={`Delete "${record.name}"?`} onConfirm={() => handleDelete(record.name)}>
          <Button size="small" danger>Delete</Button>
        </Popconfirm>
      ),
    },
  ];

  const roleColumns = [
    { title: "Role", dataIndex: "name", key: "name", render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: "Description", dataIndex: "description", key: "description", render: (v: string) => v || "-" },
    {
      title: "Actions",
      key: "actions",
      width: 200,
      render: (_: unknown, record: ClientRole) => (
        <Space>
          <Button size="small" onClick={() => openComposites(record.name)}>Permissions</Button>
          <Popconfirm title={`Delete role "${record.name}"?`} onConfirm={() => handleDelete(record.name)}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => { setCreateType("permission"); setShowCreate(true); }}>
          + Permission
        </Button>
        <Button type="primary" onClick={() => { setCreateType("role"); setShowCreate(true); }}>
          + Role
        </Button>
      </Space>

      <Title level={5} style={{ marginTop: 8 }}>Permissions ({permissionsList.length})</Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        Granular capabilities — assigned to roles, not directly to users.
      </Text>
      <Table
        dataSource={permissionsList}
        columns={permColumns}
        rowKey="name"
        pagination={false}
        size="small"
        style={{ marginBottom: 24 }}
      />

      <Title level={5}>Roles ({rolesList.length})</Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        Groups of permissions — assigned to users.
      </Text>
      <Table
        dataSource={rolesList}
        columns={roleColumns}
        rowKey="name"
        pagination={false}
        size="small"
      />

      <Modal
        title={createType === "role" ? "Create Role" : "Create Permission"}
        open={showCreate}
        onCancel={() => setShowCreate(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder={createType === "role" ? "e.g. supervisor" : "e.g. approve_application"} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Permissions in role "${showComposites}"`}
        open={!!showComposites}
        onCancel={() => setShowComposites(null)}
        footer={null}
        width={600}
      >
        <Title level={5}>Current Permissions</Title>
        {composites.length === 0 ? (
          <Text type="secondary">No permissions assigned</Text>
        ) : (
          <Space wrap style={{ marginBottom: 16 }}>
            {composites.map((c) => (
              <Tag key={c.name} color="green">{c.name}</Tag>
            ))}
          </Space>
        )}
        <Title level={5}>Add Permissions</Title>
        <Form form={compositeForm} layout="inline" onFinish={handleAddComposites}>
          <Form.Item name="roleNames" style={{ flex: 1 }}>
            <Select
              mode="multiple"
              placeholder="Select permissions to add"
              options={permissionsList
                .filter((p) => !composites.find((c) => c.name === p.name))
                .map((p) => ({ label: p.name, value: p.name }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">Add</Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ─── Route Tab ────────────────────────────────────────────

function RouteTab({
  productId,
  config,
  hasRoute,
  onRefresh,
}: {
  productId: string;
  config: Record<string, unknown> | null;
  hasRoute: boolean;
  onRefresh: () => void;
}) {
  const handleToggle = async () => {
    try {
      const result = await productsApi.toggleRoute(productId);
      message.success(`Route ${result.enabled ? "enabled" : "disabled"}`);
      onRefresh();
    } catch (err: unknown) {
      message.error((err as Error).message);
    }
  };

  if (!hasRoute) {
    return <Text type="secondary">No APISIX route configured for this product.</Text>;
  }

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={handleToggle}>Toggle Route</Button>
      </Space>
      <pre
        style={{
          background: "#f5f5f5",
          padding: 16,
          borderRadius: 6,
          overflow: "auto",
          maxHeight: 500,
          fontSize: 12,
        }}
      >
        {JSON.stringify(config, null, 2)}
      </pre>
    </>
  );
}

// ─── Tenants Tab ──────────────────────────────────────────

function TenantsTab({ tenants }: { tenants: Tenant[] }) {
  const navigate = useNavigate();

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text: string, record: Tenant) => (
        <a onClick={() => navigate(`/tenants/${record.id}`)}>{text}</a>
      ),
    },
    { title: "Alias", dataIndex: "alias", key: "alias" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => (
        <Tag color={s === "active" ? "green" : "default"}>{s}</Tag>
      ),
    },
    { title: "Plan", dataIndex: "plan", key: "plan" },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
  ];

  return (
    <Table
      dataSource={tenants}
      columns={columns}
      rowKey="id"
      pagination={false}
      size="small"
    />
  );
}
