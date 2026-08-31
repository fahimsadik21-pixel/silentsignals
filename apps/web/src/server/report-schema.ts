import { z } from "zod";

export const reporterRoles = ["student", "faculty", "staff", "other"] as const;
export const reportTargets = [
  "student",
  "faculty",
  "department",
  "leadership",
  "vice_chancellor",
] as const;
export const urgencyLevels = ["standard", "urgent", "immediate"] as const;

export const reportInputSchema = z
  .object({
    reporterRole: z.enum(reporterRoles),
    category: z.string().trim().min(3).max(100),
    urgency: z.enum(urgencyLevels),
    target: z.enum(reportTargets),
    department: z.string().trim().max(120).optional().default(""),
    title: z.string().trim().min(10).max(120),
    description: z.string().trim().min(80).max(5000),
    incidentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal(""))
      .default(""),
    location: z.string().trim().max(120).optional().default(""),
    consent: z.literal(true),
  })
  .strict();

export const caseAccessSchema = z
  .object({
    trackingCode: z.string().trim().min(1).max(32),
    accessKey: z.string().trim().min(1).max(32),
  })
  .strict();

export const messageInputSchema = z
  .object({
    body: z.string().trim().min(2).max(4000),
  })
  .strict();

export const reviewerLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    password: z.string().min(1).max(256),
  })
  .strict();

export const reviewerCaseUpdateSchema = z
  .object({
    status: z
      .enum(["received", "triage", "under_review", "awaiting_reporter", "resolved", "closed"])
      .optional(),
    priority: z.number().int().min(1).max(4).optional(),
    assignedReviewerId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(1000).optional().default(""),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.priority !== undefined ||
      value.assignedReviewerId !== undefined,
    { message: "At least one case field must be updated." },
  )
  .strict();

export const evidenceUploadPayloadSchema = z
  .object({
    fileName: z.string().trim().min(1).max(240),
    contentType: z.string().trim().min(1).max(120),
    byteSize: z.number().int().positive().max(15 * 1024 * 1024),
  })
  .strict();

export type ReportInput = z.infer<typeof reportInputSchema>;
