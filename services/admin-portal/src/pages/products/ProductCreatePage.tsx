import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, InputNumber, Button, Card, Typography, message } from "antd";
import { productsApi, type CreateProductPayload } from "../../api/products";

const { Title } = Typography;

export function ProductCreatePage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const onFinish = async (values: CreateProductPayload) => {
    setLoading(true);
    try {
      const product = await productsApi.create(values);
      message.success(`Product "${product.name}" created successfully`);
      navigate(`/products/${product.id}`);
    } catch (err: unknown) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate slug from name
  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const slug = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!form.isFieldTouched("slug")) {
      form.setFieldValue("slug", slug);
    }
  };

  return (
    <>
      <Title level={4}>Create New Product</Title>
      <Card style={{ maxWidth: 600 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
        >
          <Form.Item
            name="name"
            label="Product Name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="e.g. Doer School" onChange={onNameChange} />
          </Form.Item>

          <Form.Item
            name="slug"
            label="Slug"
            rules={[
              { required: true, message: "Slug is required" },
              {
                pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/,
                message: "Lowercase alphanumeric with dashes only",
              },
            ]}
            extra="Used as Keycloak client ID and APISIX route path prefix"
          >
            <Input placeholder="e.g. doer-school" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Brief description of the product" />
          </Form.Item>

          <Form.Item name="frontendUrl" label="Frontend URL">
            <Input placeholder="e.g. http://localhost:5174" />
          </Form.Item>

          <Form.Item name="backendUrl" label="Backend Host">
            <Input placeholder="e.g. localhost" />
          </Form.Item>

          <Form.Item name="backendPort" label="Backend Port">
            <InputNumber
              placeholder="e.g. 4002"
              min={1}
              max={65535}
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item>
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
