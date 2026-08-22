export type MiniAppReportRequestPayload = {
  initData?: unknown;
  month?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  password?: unknown;
  token?: unknown;
};

export async function readMiniAppReportRequest(request: Request): Promise<MiniAppReportRequestPayload> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return await request.json() as MiniAppReportRequestPayload;
  }

  const form = await request.formData();
  return {
    initData: form.get("initData") ?? undefined,
    month: form.get("month") ?? undefined,
    startDate: form.get("startDate") ?? undefined,
    endDate: form.get("endDate") ?? undefined,
    password: form.get("password") ?? undefined,
    token: form.get("token") ?? undefined,
  };
}
