import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, InputNumber, Button, Card, Typography, message, Divider, Space, Select, Checkbox, Tag } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { productsApi, type CreateProductPayload } from "../../api/products";

const { Title, Text } = Typography;

interface PermissionEntry {
  name: string;
  description: string;
}

interface RoleEntry {
  name: string;
  description: string;
  permissions: string[];
}

export function ProductCreatePage() {
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [roles, setRoles] = useState<RoleEntry[]>([]);
  const [permName, setPermName] = useState("");
  const [permDesc, setPermDesc] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const payload: CreateProductPayload = {
        ...values,
        permissions: permissions.length > 0 ? permissions : undefined,
        roles: roles.length > 0 ? roles : undefined,
        defaultRole: values.defaultRole || undefined,
      };
      const product = await productsApi.create(payload);
      message.success(`Product "${product.name}" created with ${permissions.length} permissions and ${roles.length} roles`);
      navigate(`/products/${product.id}`);
    } catch (err: unknown) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slug = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!form.isFieldTouched("slug")) {
      form.setFieldValue("slug", slug);
    }
  };

  // ─── Permission Management ────────────────────────────
  const addPermission = () => {
    const name = permName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    if (permissions.find((p) => p.name === name)) {
      message.warning(`Permission "${name}" already exists`);
      return;
    }
    setPermissions([...permissions, { name, description: permDesc.trim() }]);
    setPermName("");
    setPermDesc("");
  };

  const removePermission = (name: string) => {
    setPermissions(permissions.filter((p) => p.name !== name));
    // Also remove from any role that references it
    setRoles(roles.map((r) => ({
      ...r,
      permissions: r.permissions.filter((p) => p !== name),
    })));
  };

  // ─── Role Management ─────────────────────────────────
  const addRole = () => {
    const name = roleName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!name) return;
    if (roles.find((r) => r.name === name)) {
      message.warning(`Role "${name}" already exists`);
      return;
    }
    if (permissions.find((p) => p.name === name)) {
      message.warning(`"${name}" is already a permission name — use a different name`);
      return;
    }
    setRoles([...roles, { name, description: roleDesc.trim(), permissions: rolePerms }]);
    setRoleName("");
    setRoleDesc("");
    setRolePerms([]);
  };

  const removeRole = (name: string) => {
    setRoles(roles.filter((r) => r.name !== name));
    const current = form.getFieldValue("defaultRole");
    if (current === name) {
      form.setFieldValue("defaultRole", undefined);
    }
  };

  return (
    <>
      <Title level={4}>Create New Product</Title>
      <Card style={{ maxWidth: 800 }}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          {/* ─── Product Info ───────────────────────────── */}
          <Divider orientation="left">Product Info</Divider>

          <Form.Item name="name" label="Product Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Doer Visa" onChange={onNameChange} />
          </Form.Item>

          <Form.Item
            name="slug" label="Slug"
            rules={[
              { required: true },
              { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: "Lowercase alphanumeric with dashes only" },
            ]}
            extra="Used as Keycloak client ID and APISIX route path prefix"
          >
            <Input placeholder="e.g. doer-visa" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Brief description" />
          </Form.Item>

          {/* ─── Infrastructure ─────────────────────────── */}
          <Divider orientation="left">Infrastructure</Divider>

          <Form.Item name="frontendUrl" label="Frontend URL">
            <Input placeholder="e.g. http://localhost:5173" />
          </Form.Item>

          <Form.Item name="backendUrl" label="Backend Host">
            <Input placeholder="e.g. localhost" />
          </Form.Item>

          <Form.Item name="backendPort" label="Backend Port">
            <InputNumber placeholder="e.g. 4001" min={1} max={65535} style={{ width: "100%" }} />
          </Form.Item>

          {/* ─── Step 1: Permissions ────────────────────── */}
          <Divider orientation="left">Step 1: Permissions</Divider>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            Define the granular capabilities for this product. Permissions represent
            specific actions like <code>create_application</code>, <code>view_report</code>, <code>approve_request</code>.
          </Text>

          <Space style={{ marginBottom: 12 }}>
            <Input
              placeholder="Permission name (e.g. create_application)"
              value={permName}
              onChange={(e) => setPermName(e.target.value)}
              onPressEnter={(e) => { e.preventDefault(); addPermission(); }}
              style={{ width: 250 }}
            />
            <Input
              placeholder="Description (optional)"
              value={permDesc}
              onChange={(e) => setPermDesc(e.target.value)}
              onPressEnter={(e) => { e.preventDefault(); addPermission(); }}
              style={{ width: 280 }}
            />
            <Button icon={<PlusOutlined />} onClick={addPermission}>Add</Button>
          </Space>

          {permissions.length > 0 && (
            <div style={{
              background: "#f0fdf4", borderRadius: 8, padding: 12, marginBottom: 16,
              border: "1px solid #bbf7d0",
            }}>
              {permissions.map((perm) => (
                <div key={perm.name} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", borderBottom: "1px solid #dcfce7",
                }}>
                  <div>
                    <Tag color="green" style={{ fontWeight: 600 }}>{perm.name}</Tag>
                    {perm.description && (
                      <span style={{ color: "#6b7280", fontSize: 13 }}>{perm.description}</span>
                    )}
                  </div>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removePermission(perm.name)} />
                </div>
              ))}
            </div>
          )}

          {/* ─── Step 2: Roles ──────────────────────────── */}
          <Divider orientation="left">Step 2: Roles</Divider>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            Define roles that group permissions together. For example, <code>admin</code> might include all permissions,
            while <code>employee</code> includes only <code>create_application</code> and <code>view_application</code>.
            Users will be assigned roles, not individual permissions.
          </Text>

          {permissions.length === 0 ? (
            <Text type="secondary" italic style={{ display: "block", marginBottom: 16 }}>
              Add permissions above first, then define roles here.
            </Text>
          ) : (
            <>
              <div style={{
                background: "#fafafa", borderRadius: 8, padding: 16, marginBottom: 12,
                border: "1px solid #e5e7eb",
              }}>
                <Space style={{ marginBottom: 12, width: "100%" }} direction="vertical">
                  <Space>
                    <Input
                      placeholder="Role name (e.g. admin)"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      style={{ width: 200 }}
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={roleDesc}
                      onChange={(e) => setRoleDesc(e.target.value)}
                      style={{ width: 280 }}
                    />
                  </Space>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                      Select permissions for this role:
                    </Text>
                    <Checkbox.Group
                      value={rolePerms}
                      onChange={(checked) => setRolePerms(checked as string[])}
                      options={permissions.map((p) => ({ label: p.name, value: p.name }))}
                    />
                  </div>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={addRole}
                    disabled={!roleName.trim() || rolePerms.length === 0}
                  >
                    Add Role
                  </Button>
                </Space>
              </div>
            </>
          )}

          {roles.length > 0 && (
            <div style={{
              background: "#eff6ff", borderRadius: 8, padding: 12, marginBottom: 16,
              border: "1px solid #bfdbfe",
            }}>
              {roles.map((role) => (
                <div key={role.name} style={{
                  padding: "8px 0", borderBottom: "1px solid #dbeafe",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <Tag color="blue" style={{ fontWeight: 600 }}>{role.name}</Tag>
                      {role.description && (
                        <span style={{ color: "#6b7280", fontSize: 13 }}>{role.description}</span>
                      )}
                    </div>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeRole(role.name)} />
                  </div>
                  <div style={{ marginTop: 4, paddingLeft: 8 }}>
                    {role.permissions.map((p) => (
                      <Tag key={p} color="green" style={{ fontSize: 11 }}>{p}</Tag>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Step 3: Default Role ──────────────────── */}
          <Divider orientation="left">Step 3: Default Role for Self-Registration</Divider>
          <Form.Item
            name="defaultRole"
            label="Default Role"
            extra="Which role should be automatically assigned when a user self-registers?"
          >
            <Select
              placeholder="Select a role"
              allowClear
              options={roles.map((r) => ({ label: r.name, value: r.name }))}
              disabled={roles.length === 0}
            />
          </Form.Item>

          {/* ─── Submit ────────────────────────────────── */}
          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={loading}>
              Create Product
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={() => navigate("/products")}>
              Cancel
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
