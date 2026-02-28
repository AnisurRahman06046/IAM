export interface ApisixRouteConfig {
  name: string;
  desc?: string;
  uri?: string;
  uris?: string[];
  methods: string[];
  upstream: {
    type: string;
    nodes: Record<string, number>;
    timeout?: { connect: number; send: number; read: number };
  };
  plugins: Record<string, unknown>;
  status?: 0 | 1;
}
