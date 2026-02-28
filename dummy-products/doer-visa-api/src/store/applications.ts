import { v4 as uuidv4 } from "uuid";
import type { VisaApplication } from "../types.js";

const store = new Map<string, VisaApplication>();

export function createApplication(
  userId: string,
  userEmail: string,
  organizationId: string,
  destination: string,
  purpose: string,
): VisaApplication {
  const now = new Date().toISOString();
  const app: VisaApplication = {
    id: uuidv4(),
    userId,
    userEmail,
    organizationId,
    destination,
    purpose,
    status: "submitted",
    createdAt: now,
    updatedAt: now,
  };
  store.set(app.id, app);
  return app;
}

export function findByOrg(organizationId: string): VisaApplication[] {
  return [...store.values()].filter((a) => a.organizationId === organizationId);
}

export function findByOrgAndUser(organizationId: string, userId: string): VisaApplication[] {
  return [...store.values()].filter(
    (a) => a.organizationId === organizationId && a.userId === userId,
  );
}

export function findById(id: string): VisaApplication | undefined {
  return store.get(id);
}

export function updateStatus(
  id: string,
  status: VisaApplication["status"],
): VisaApplication | undefined {
  const app = store.get(id);
  if (!app) return undefined;
  app.status = status;
  app.updatedAt = new Date().toISOString();
  return app;
}

export function deleteApplication(id: string): boolean {
  return store.delete(id);
}
