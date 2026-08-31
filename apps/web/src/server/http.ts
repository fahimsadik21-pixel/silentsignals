import { NextResponse } from "next/server";
import { ServiceConfigurationError } from "@/server/config";

export function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export function serviceErrorResponse(error: unknown) {
  if (error instanceof ServiceConfigurationError) {
    return jsonResponse(
      {
        error: {
          code: "SERVICE_NOT_CONFIGURED",
          message: "The secure case service is not configured yet.",
        },
      },
      503,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The secure case service could not complete the request.",
      },
    },
    500,
  );
}

export function isRequestTooLarge(request: Request, maximumBytes = 64 * 1024) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(contentLength) && contentLength > maximumBytes;
}

export function getClientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
