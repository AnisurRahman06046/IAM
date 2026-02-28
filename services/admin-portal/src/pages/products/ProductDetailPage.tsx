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
  const [showComposites, setShowComposites] = useState<string | null>(null);
  const [composites, setComposites] = useState<ClientRole[]>([]);
  const [form] = Form.useForm();
  const [compositeForm] = Form.useForm();

  const handleCreate = async (values: { name: string; description?: string }) => {
    try {
      await productsApi.createRole(productId, values);
      message.success(`Role "${values.name}" created`);
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
      message.success(`Role "${roleName}" deleted`);
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
      message.success("Composites added");
      compositeForm.resetFields();
      openComposites(showComposites);
    } catch (err: unknown) {
      message.error((err as Error).message);
    }
  };

  const columns = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Description", dataIndex: "description", key: "description", render: (v: string) => v || "-" },
    {
      title: "Composite",
      dataIndex: "composite",
      key: "composite",
      render: (v: boolean) => (v ? <Tag color="blue">composite</Tag> : null),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: ClientRole) => (
        <Space>
          <Button size="small" onClick={() => openComposites(record.name)}>
            Composites
          </Button>
          <Popconfirm
            title={`Delete role "${record.name}"?`}
            onConfirm={() => handleDelete(record.name)}
          >
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Button
        type="primary"
        style={{ marginBottom: 16 }}
        onClick={() => setShowCreate(true)}
      >
        Add Role
      </Button>
      <Table
        dataSource={roles}
        columns={columns}
        rowKey="name"
        pagination={false}
        size="small"
      />

      <Modal
        title="Create Client Role"
        open={showCreate}
        onCancel={() => setShowCreate(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="Role Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. manage_students" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Composites for "${showComposites}"`}
        open={!!showComposites}
        onCancel={() => setShowComposites(null)}
        footer={null}
        width={600}
      >
        <Title level={5}>Current Composites</Title>
        {composites.length === 0 ? (
          <Text type="secondary">No composites</Text>
        ) : (
          <Space wrap style={{ marginBottom: 16 }}>
            {composites.map((c) => (
              <Tag key={c.name}>{c.name}</Tag>
            ))}
          </Space>
        )}
        <Title level={5}>Add Composites</Title>
        <Form form={compositeForm} layout="inline" onFinish={handleAddComposites}>
          <Form.Item name="roleNames" style={{ flex: 1 }}>
            <Select
              mode="multiple"
              placeholder="Select roles"
              options={roles
                .filter((r) => r.name !== showComposites)
                .map((r) => ({ label: r.name, value: r.name }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              Add
            </Button>
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
