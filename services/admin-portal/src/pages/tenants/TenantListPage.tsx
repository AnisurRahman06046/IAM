import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Typography, Tag, message, Spin } from "antd";
import { tenantsApi, type Tenant } from "../../api/tenants";

const { Title } = Typography;

export function TenantListPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const fetchTenants = (p: number) => {
    setLoading(true);
    tenantsApi
      .list({ page: p, limit: 20 })
      .then((res) => {
        setTenants(res.items);
        setTotal(res.meta.total);
      })
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTenants(page);
  }, [page]);

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
    { title: "Product", dataIndex: "product", key: "product" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => (
        <Tag color={s === "active" ? "green" : s === "inactive" ? "default" : "red"}>
          {s}
        </Tag>
      ),
    },
    { title: "Plan", dataIndex: "plan", key: "plan" },
    { title: "Max Users", dataIndex: "maxUsers", key: "maxUsers" },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
  ];

  return (
    <>
      <Title level={4}>Tenants</Title>
      <Table
        dataSource={tenants}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
        }}
      />
    </>
  );
}
