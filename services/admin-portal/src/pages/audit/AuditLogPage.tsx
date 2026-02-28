import React, { useEffect, useState } from "react";
import { Table, Typography, DatePicker, Select, Space, Input, message } from "antd";
import { platformApi, type AuditLogEntry } from "../../api/platform";

const { Title } = Typography;
const { RangePicker } = DatePicker;

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const fetchLogs = (p: number, f: Record<string, string>) => {
    setLoading(true);
    const params: Record<string, string> = {
      ...f,
      page: String(p),
      limit: "20",
    };
    // Remove empty values
    Object.keys(params).forEach((k) => {
      if (!params[k]) delete params[k];
    });
    platformApi
      .getAuditLogs(params)
      .then((res) => {
        setLogs(res?.items || []);
        setTotal(res?.meta?.total || res?.total || 0);
      })
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs(page, filters);
  }, [page, filters]);

  const columns = [
    {
      title: "Time",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    { title: "Action", dataIndex: "action", key: "action" },
    { title: "Resource", dataIndex: "resourceType", key: "resourceType" },
    { title: "Resource ID", dataIndex: "resourceId", key: "resourceId", ellipsis: true },
    { title: "Actor", dataIndex: "actorId", key: "actorId", ellipsis: true },
    { title: "IP", dataIndex: "ipAddress", key: "ipAddress" },
    {
      title: "Metadata",
      dataIndex: "metadata",
      key: "metadata",
      ellipsis: true,
      render: (v: Record<string, unknown>) =>
        v ? JSON.stringify(v).slice(0, 100) : "-",
    },
  ];

  return (
    <>
      <Title level={4}>Audit Logs</Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          placeholder="Action"
          allowClear
          style={{ width: 200 }}
          onChange={(v) => setFilters((f) => ({ ...f, action: v || "" }))}
          options={[
            { label: "tenant.created", value: "tenant.created" },
            { label: "tenant.updated", value: "tenant.updated" },
            { label: "tenant.activated", value: "tenant.activated" },
            { label: "tenant.deactivated", value: "tenant.deactivated" },
            { label: "product.created", value: "product.created" },
            { label: "product.updated", value: "product.updated" },
            { label: "product.deactivated", value: "product.deactivated" },
            { label: "product.role.created", value: "product.role.created" },
            { label: "product.role.deleted", value: "product.role.deleted" },
            { label: "user.registered", value: "user.registered" },
            { label: "user.roles.updated", value: "user.roles.updated" },
          ]}
        />
        <Select
          placeholder="Resource Type"
          allowClear
          style={{ width: 150 }}
          onChange={(v) => setFilters((f) => ({ ...f, resourceType: v || "" }))}
          options={[
            { label: "tenant", value: "tenant" },
            { label: "product", value: "product" },
            { label: "user", value: "user" },
            { label: "invitation", value: "invitation" },
          ]}
        />
        <RangePicker
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setFilters((f) => ({
                ...f,
                from: dates[0]!.toISOString(),
                to: dates[1]!.toISOString(),
              }));
            } else {
              setFilters((f) => {
                const { from, to, ...rest } = f;
                return rest;
              });
            }
          }}
        />
      </Space>
      <Table
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
        }}
        size="small"
      />
    </>
  );
}
