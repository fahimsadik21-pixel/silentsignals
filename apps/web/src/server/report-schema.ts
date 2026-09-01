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
    privateKey: z.string().trim().min(1).max(64).optional(),
    password: z.string().min(1).max(256).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.privateKey || value.password), {
    message: "Provide either the assigned private key or password.",
  });

export const reviewerRegistrationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(320),
    department: z.string().trim().max(120).optional().default(""),
  })
  .strict();

export const governanceRegistrationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    password: z.string().min(14, "Use at least 14 characters.").max(256),
  })
  .strict();

export const governanceTeamSchema = z
  .object({
    label: z.string().trim().min(3).max(80),
    teamType: z.enum(["committee", "independent_oversight"]),
  })
  .strict();

export const governanceDecisionSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    teamId: z.string().uuid().optional(),
    slotNumber: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export const reviewerAvailabilitySchema = z
  .object({ availability: z.enum(["available", "away", "offline"]) })
  .strict();

export const internalNoteSchema = z
  .object({ body: z.string().trim().min(2).max(4000) })
  .strict();

export const reviewerCaseUpdateSchema = z
  .object({
    status: z
      .enum([
        "received",
        "triage",
        "under_review",
        "awaiting_reporter",
        "resolved",
        "closed",
      ])
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
    byteSize: z
      .number()
      .int()
      .positive()
      .max(15 * 1024 * 1024),
  })
  .strict();

export type ReportInput = z.infer<typeof reportInputSchema>;
