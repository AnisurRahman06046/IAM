export interface RequestUser {
  id: string;
  email: string;
  realmRoles: string[];
  clientRoles: string[];
  organizationId?: string;
}

export interface VisaApplication {
  id: string;
  userId: string;
  userEmail: string;
  organizationId: string;
  destination: string;
  purpose: string;
  status: "submitted" | "processing" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}
