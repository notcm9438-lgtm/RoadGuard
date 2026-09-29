import { Router, type IRouter } from "express";
import { and, count, desc, eq } from "drizzle-orm";
import { db, complaintsTable, hazardsTable, reportsTable } from "@workspace/db";
import {
  AnalyzeRoadBody,
  AnalyzeRoadResponse,
  ClearDemoDataResponse,
  CreateComplaintBody,
  CreateComplaintResponse,
  CreateHazardBody,
  CreateHazardResponse,
  DeleteHazardParams,
  DeleteHazardResponse,
  GetAnalyticsResponse,
  GetComplaintParams,
  GetComplaintResponse,
  GetComplaintsResponse,
  GetDashboardResponse,
  GetHazardParams,
  GetHazardResponse,
  GetHazardsQueryParams,
  GetHazardsResponse,
  GetReportParams,
  GetReportResponse,
  GetReportsResponse,
  SeedDemoDataResponse,
  UpdateComplaintBody,
  UpdateComplaintParams,
  UpdateComplaintResponse,
  UpdateHazardBody,
  UpdateHazardParams,
  UpdateHazardResponse,
} from "@workspace/api-zod";
import { buildAnalysis, calculateRiskScore, getRiskLevel } from "../lib/risk-engine";

const router: IRouter = Router();

function formatHazard(hazard: typeof hazardsTable.$inferSelect) {
  return {
    ...hazard,
    createdAt: hazard.createdAt.toISOString(),
    updatedAt: hazard.updatedAt.toISOString(),
  };
}

function formatComplaint(complaint: typeof complaintsTable.$inferSelect) {
  return {
    ...complaint,
    createdAt: complaint.createdAt.toISOString(),
    updatedAt: complaint.updatedAt.toISOString(),
  };
}

function formatReport(
  report: typeof reportsTable.$inferSelect,
  hazard: typeof hazardsTable.$inferSelect,
) {
  return {
    id: report.id,
    reportNumber: report.reportNumber,
    generatedAt: report.generatedAt.toISOString(),
    status: report.status,
    hazard: formatHazard(hazard),
  };
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const hazards = await db.select().from(hazardsTable).orderBy(desc(hazardsTable.createdAt));
  const complaints = await db.select().from(complaintsTable);
  const data = {
    totalRecords: hazards.length,
    highRisk: hazards.filter((item) => item.riskLevel === "HIGH").length,
    mediumRisk: hazards.filter((item) => item.riskLevel === "MEDIUM").length,
    lowRisk: hazards.filter((item) => item.riskLevel === "LOW").length,
    openComplaints: complaints.filter(
      (item) => !["RESOLVED", "REJECTED"].includes(item.status),
    ).length,
    recentHazards: hazards.slice(0, 5).map(formatHazard),
  };
  res.json(GetDashboardResponse.parse(data));
});

router.get("/hazards", async (req, res): Promise<void> => {
  const filters = GetHazardsQueryParams.parse(req.query);
  const conditions = [];
  if (filters.riskLevel) conditions.push(eq(hazardsTable.riskLevel, filters.riskLevel));
  if (filters.status) conditions.push(eq(hazardsTable.status, filters.status));
  const hazards = await db
    .select()
    .from(hazardsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(hazardsTable.createdAt));
  res.json(GetHazardsResponse.parse(hazards.map(formatHazard)));
});

router.post("/hazards", async (req, res): Promise<void> => {
  const parsed = CreateHazardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const payload = parsed.data;
  const riskScore = Math.max(0, Math.min(100, payload.riskScore));
  const [hazard] = await db
    .insert(hazardsTable)
    .values({
      ...payload,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
      status: payload.status ?? "OPEN",
      isDemo: payload.isDemo ?? false,
    })
    .returning();
  const result = CreateHazardResponse.parse(formatHazard(hazard));
  await db.insert(reportsTable).values({
    reportNumber: `RG-RPT-${new Date().getFullYear()}-${String(hazard.id).padStart(4, "0")}`,
    hazardId: hazard.id,
    status: "GENERATED",
  });
  res.status(201).json(result);
});

router.get("/hazards/:id", async (req, res): Promise<void> => {
  const params = GetHazardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [hazard] = await db
    .select()
    .from(hazardsTable)
    .where(eq(hazardsTable.id, params.data.id));
  if (!hazard) {
    res.status(404).json({ error: "Hazard not found" });
    return;
  }
  res.json(GetHazardResponse.parse(formatHazard(hazard)));
});

router.patch("/hazards/:id", async (req, res): Promise<void> => {
  const params = UpdateHazardParams.safeParse(req.params);
  const parsed = UpdateHazardBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const patch = { ...parsed.data };
  if (patch.riskScore !== undefined) {
    Object.assign(patch, { riskLevel: getRiskLevel(patch.riskScore) });
  }
  const [hazard] = await db
    .update(hazardsTable)
    .set(patch)
    .where(eq(hazardsTable.id, params.data.id))
    .returning();
  if (!hazard) {
    res.status(404).json({ error: "Hazard not found" });
    return;
  }
  res.json(UpdateHazardResponse.parse(formatHazard(hazard)));
});

router.delete("/hazards/:id", async (req, res): Promise<void> => {
  const params = DeleteHazardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [hazard] = await db
    .delete(hazardsTable)
    .where(eq(hazardsTable.id, params.data.id))
    .returning();
  if (!hazard) {
    res.status(404).json({ error: "Hazard not found" });
    return;
  }
  res.status(204).json(DeleteHazardResponse.parse(undefined));
});

router.post("/analyze-road", async (req, res): Promise<void> => {
  const parsed = AnalyzeRoadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = AnalyzeRoadResponse.parse(
    buildAnalysis(parsed.data.hazardType ?? "Pothole", parsed.data.location),
  );
  res.json(result);
});

router.get("/complaints", async (_req, res): Promise<void> => {
  const complaints = await db
    .select()
    .from(complaintsTable)
    .orderBy(desc(complaintsTable.createdAt));
  res.json(GetComplaintsResponse.parse(complaints.map(formatComplaint)));
});

router.post("/complaints", async (req, res): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const payload = parsed.data;
  const [created] = await db
    .insert(complaintsTable)
    .values({
      ...payload,
      referenceNumber: `RG-CMP-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      status: "SUBMITTED",
    })
    .returning();
  res.status(201).json(CreateComplaintResponse.parse(formatComplaint(created)));
});

router.get("/complaints/:id", async (req, res): Promise<void> => {
  const params = GetComplaintParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [complaint] = await db
    .select()
    .from(complaintsTable)
    .where(eq(complaintsTable.id, params.data.id));
  if (!complaint) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }
  res.json(GetComplaintResponse.parse(formatComplaint(complaint)));
});

router.patch("/complaints/:id", async (req, res): Promise<void> => {
  const params = UpdateComplaintParams.safeParse(req.params);
  const parsed = UpdateComplaintBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [complaint] = await db
    .update(complaintsTable)
    .set(parsed.data)
    .where(eq(complaintsTable.id, params.data.id))
    .returning();
  if (!complaint) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }
  res.json(UpdateComplaintResponse.parse(formatComplaint(complaint)));
});

router.get("/reports", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ report: reportsTable, hazard: hazardsTable })
    .from(reportsTable)
    .innerJoin(hazardsTable, eq(reportsTable.hazardId, hazardsTable.id))
    .orderBy(desc(reportsTable.generatedAt));
  res.json(GetReportsResponse.parse(rows.map(({ report, hazard }) => formatReport(report, hazard))));
});

router.get("/reports/:id", async (req, res): Promise<void> => {
  const params = GetReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({ report: reportsTable, hazard: hazardsTable })
    .from(reportsTable)
    .innerJoin(hazardsTable, eq(reportsTable.hazardId, hazardsTable.id))
    .where(eq(reportsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json(GetReportResponse.parse(formatReport(row.report, row.hazard)));
});

router.get("/analytics", async (_req, res): Promise<void> => {
  const [hazards, complaints] = await Promise.all([
    db.select().from(hazardsTable).orderBy(hazardsTable.createdAt),
    db.select().from(complaintsTable),
  ]);
  const group = (values: string[]) =>
    Object.entries(
      values.reduce<Record<string, number>>((acc, value) => {
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([label, value]) => ({ label, count: value }));
  const monthGroup = group(
    hazards.map((item) => item.createdAt.toISOString().slice(0, 7)),
  );
  const data = {
    totalHazards: hazards.length,
    highRisk: hazards.filter((item) => item.riskLevel === "HIGH").length,
    mediumRisk: hazards.filter((item) => item.riskLevel === "MEDIUM").length,
    lowRisk: hazards.filter((item) => item.riskLevel === "LOW").length,
    resolvedHazards: hazards.filter((item) => item.status === "RESOLVED").length,
    openComplaints: complaints.filter(
      (item) => !["RESOLVED", "REJECTED"].includes(item.status),
    ).length,
    riskDistribution: group(hazards.map((item) => item.riskLevel)),
    hazardTypeDistribution: group(hazards.map((item) => item.hazardType)),
    hazardsOverTime: monthGroup,
    complaintStatus: group(complaints.map((item) => item.status)),
    authorityDistribution: group(hazards.map((item) => item.responsibleAuthority)),
  };
  res.json(GetAnalyticsResponse.parse(data));
});

router.post("/demo-data", async (_req, res): Promise<void> => {
  const demo = [
    ["Waterlogging", "Triambakeshwar", 90, 65, "HIGH", "Municipal Corporation"],
    ["Pothole", "Nashik Road", 65, 48, "MEDIUM", "Public Works Department"],
    ["Cracked Road", "Igatpuri", 52, 42, "MEDIUM", "State Highway Department"],
    ["Road Debris", "Sinnar", 28, 20, "LOW", "Local Road Authority"],
  ] as const;
  let created = 0;
  for (const [hazardType, location, riskScore, damagePercentage, riskLevel, authority] of demo) {
    const [hazard] = await db
      .insert(hazardsTable)
      .values({
        hazardType,
        location,
        latitude: 19.9 + created * 0.08,
        longitude: 73.8 + created * 0.1,
        damagePercentage,
        riskScore,
        riskLevel,
        description: "DEMO DATA — example road condition for exploring RoadGuard.",
        recommendedAction: "DEMO DATA — inspect and route to the appropriate authority.",
        responsibleAuthority: authority,
        status: "OPEN",
        isDemo: true,
      })
      .returning();
    await db.insert(reportsTable).values({
      reportNumber: `RG-DEMO-RPT-${hazard.id}`,
      hazardId: hazard.id,
      status: "DEMO DATA",
    });
    created += 1;
  }
  res.status(201).json(SeedDemoDataResponse.parse({ created }));
});

router.delete("/demo-data", async (_req, res): Promise<void> => {
  await db.delete(hazardsTable).where(eq(hazardsTable.isDemo, true));
  res.status(204).json(ClearDemoDataResponse.parse(undefined));
});

export default router;