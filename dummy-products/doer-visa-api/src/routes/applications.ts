import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/require-role.js";
import * as store from "../store/applications.js";

export const applicationRoutes = Router();

// GET /api/visa/me — return user identity as seen by the backend (from APISIX headers)
applicationRoutes.get("/me", requireAuth, (req, res) => {
  res.json({
    id: req.user!.id,
    email: req.user!.email,
    realmRoles: req.user!.realmRoles,
    clientRoles: req.user!.clientRoles,
    organizationId: req.user!.organizationId || null,
  });
});

// POST /api/visa/applications — create a new application
applicationRoutes.post(
  "/applications",
  requireAuth,
  requireRole("apply_visa", "manage_all"),
  (req, res) => {
    const { destination, purpose } = req.body;
    if (!destination || !purpose) {
      res.status(400).json({ error: "destination and purpose are required" });
      return;
    }
    if (!req.user!.organizationId) {
      res.status(400).json({ error: "User has no organization" });
      return;
    }
    const app = store.createApplication(
      req.user!.id,
      req.user!.email,
      req.user!.organizationId,
      destination,
      purpose,
    );
    res.status(201).json(app);
  },
);

// GET /api/visa/applications — list applications (org-scoped)
applicationRoutes.get("/applications", requireAuth, (req, res) => {
  if (!req.user!.organizationId) {
    res.json([]);
    return;
  }
  const roles = req.user!.clientRoles;
  const canViewAll =
    roles.includes("view_applications") ||
    roles.includes("manage_applications") ||
    roles.includes("manage_all");

  if (canViewAll) {
    res.json(store.findByOrg(req.user!.organizationId));
  } else {
    res.json(store.findByOrgAndUser(req.user!.organizationId, req.user!.id));
  }
});

// GET /api/visa/applications/:id — get one application (org-scoped)
applicationRoutes.get("/applications/:id", requireAuth, (req, res) => {
  const app = store.findById(req.params.id as string);
  if (!app || app.organizationId !== req.user!.organizationId) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  const roles = req.user!.clientRoles;
  const canViewAll =
    roles.includes("view_applications") ||
    roles.includes("manage_applications") ||
    roles.includes("manage_all");
  if (!canViewAll && app.userId !== req.user!.id) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.json(app);
});

// PUT /api/visa/applications/:id/process — set status to "processing"
applicationRoutes.put(
  "/applications/:id/process",
  requireAuth,
  requireRole("process_visa", "manage_all"),
  (req, res) => {
    const app = store.findById(req.params.id as string);
    if (!app || app.organizationId !== req.user!.organizationId) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    if (app.status !== "submitted") {
      res.status(400).json({ error: `Cannot process application in '${app.status}' status` });
      return;
    }
    const updated = store.updateStatus(app.id, "processing");
    res.json(updated);
  },
);

// PUT /api/visa/applications/:id/approve — set status to "approved"
applicationRoutes.put(
  "/applications/:id/approve",
  requireAuth,
  requireRole("approve_visa", "manage_all"),
  (req, res) => {
    const app = store.findById(req.params.id as string);
    if (!app || app.organizationId !== req.user!.organizationId) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    if (app.status !== "processing") {
      res.status(400).json({ error: `Cannot approve application in '${app.status}' status` });
      return;
    }
    const updated = store.updateStatus(app.id, "approved");
    res.json(updated);
  },
);

// PUT /api/visa/applications/:id/reject — set status to "rejected"
applicationRoutes.put(
  "/applications/:id/reject",
  requireAuth,
  requireRole("approve_visa", "manage_all"),
  (req, res) => {
    const app = store.findById(req.params.id as string);
    if (!app || app.organizationId !== req.user!.organizationId) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    if (app.status !== "submitted" && app.status !== "processing") {
      res.status(400).json({ error: `Cannot reject application in '${app.status}' status` });
      return;
    }
    const updated = store.updateStatus(app.id, "rejected");
    res.json(updated);
  },
);

// DELETE /api/visa/applications/:id — delete own submitted application
applicationRoutes.delete(
  "/applications/:id",
  requireAuth,
  (req, res) => {
    const app = store.findById(req.params.id as string);
    if (!app || app.organizationId !== req.user!.organizationId) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    const isOwner = app.userId === req.user!.id;
    const isAdmin = req.user!.clientRoles.includes("manage_all");
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: "Can only delete your own applications" });
      return;
    }
    if (!isAdmin && app.status !== "submitted") {
      res.status(400).json({ error: "Can only delete applications in 'submitted' status" });
      return;
    }
    store.deleteApplication(app.id);
    res.status(204).send();
  },
);
