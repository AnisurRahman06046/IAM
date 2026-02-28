import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, Button, Select, InputNumber, Card, Typography, message, Divider } from "antd";
import { tenantsApi, type CreateTenantPayload } from "../../api/tenants";
import { productsApi, type Product } from "../../api/products";

const { Title, Text } = Typography;

export function TenantCreatePage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    productsApi.list().then((res) => {
      const active = (res || []).filter((p) => p.status === "active");
      setProducts(active);
    });
  }, []);

  const onFinish = (values: CreateTenantPayload) => {
    setLoading(true);
    tenantsApi
      .create(values)
      .then((tenant) => {
        message.success(`Tenant "${tenant.name}" created successfully`);
        navigate("/tenants");
      })
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  };

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    if (!form.getFieldValue("alias")) {
      const alias = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setFieldsValue({ alias });
    }
  };

  return (
    <>
      <Title level={4}>Onboard New Tenant</Title>
      <Card style={{ maxWidth: 600 }}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Divider orientation="left">Organization</Divider>

          <Form.Item name="name" label="Organization Name" rules={[{ required: true }]}>
            <Input placeholder="Acme Corporation" onChange={onNameChange} />
          </Form.Item>

          <Form.Item
            name="alias"
            label="Alias (unique identifier)"
            rules={[
              { required: true },
              { pattern: /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/, message: "Lowercase alphanumeric with dashes, 2-64 chars" },
            ]}
          >
            <Input placeholder="acme-corp" />
          </Form.Item>

          <Form.Item name="product" label="Product" rules={[{ required: true }]}>
            <Select placeholder="Select a product">
              {products.map((p) => (
                <Select.Option key={p.slug} value={p.slug}>
                  {p.name} ({p.slug})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="plan" label="Plan" initialValue="basic">
            <Select>
              <Select.Option value="basic">Basic</Select.Option>
              <Select.Option value="professional">Professional</Select.Option>
              <Select.Option value="enterprise">Enterprise</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="maxUsers" label="Max Users" initialValue={50}>
            <InputNumber min={1} max={100000} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="billingEmail" label="Billing Email">
            <Input placeholder="billing@acme.com" />
          </Form.Item>

          <Form.Item name="domain" label="Domain">
            <Input placeholder="acme.com" />
          </Form.Item>

          <Divider orientation="left">Tenant Admin User</Divider>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            This user will be the administrator of the tenant organization.
          </Text>

          <Form.Item name="adminFullName" label="Admin Full Name" rules={[{ required: true }]}>
            <Input placeholder="John Admin" />
          </Form.Item>

          <Form.Item name="adminEmail" label="Admin Email" rules={[{ required: true }, { type: "email" }]}>
            <Input placeholder="admin@acme.com" />
          </Form.Item>

          <Form.Item
            name="adminPassword"
            label="Admin Password"
            rules={[
              { required: true },
              { min: 8, message: "At least 8 characters" },
              {
                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/,
                message: "Must contain uppercase, lowercase, digit, and special character",
              },
            ]}
          >
            <Input.Password placeholder="Strong password" />
          </Form.Item>

          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Create Tenant
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </>
  );
}
