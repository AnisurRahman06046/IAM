import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Button, Tag, Typography, Space, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { productsApi, type Product } from "../../api/products";

const { Title } = Typography;

export function ProductListPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchProducts = () => {
    setLoading(true);
    productsApi
      .list()
      .then(setProducts)
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(fetchProducts, []);

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text: string, record: Product) => (
        <a onClick={() => navigate(`/products/${record.id}`)}>{text}</a>
      ),
    },
    { title: "Slug", dataIndex: "slug", key: "slug" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => (
        <Tag color={s === "active" ? "green" : "default"}>{s}</Tag>
      ),
    },
    {
      title: "Backend",
      key: "backend",
      render: (_: unknown, r: Product) =>
        r.backendUrl && r.backendPort
          ? `${r.backendUrl}:${r.backendPort}`
          : "-",
    },
    {
      title: "Route",
      dataIndex: "apisixRouteId",
      key: "route",
      render: (v: string | null) =>
        v ? <Tag color="blue">{v}</Tag> : <Tag>none</Tag>,
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
  ];

  return (
    <>
      <Space
        style={{
          width: "100%",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          Products
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate("/products/new")}
        >
          New Product
        </Button>
      </Space>
      <Table
        dataSource={products}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />
    </>
  );
}
