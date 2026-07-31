export interface CronAuthFailure {
  error: string;
  status: 401 | 503;
}

/** Fail closed so a missing deployment secret never makes a cron route public. */
export function getCronAuthFailure(
  request: Request,
  cronSecret: string | undefined = process.env.CRON_SECRET,
): CronAuthFailure | null {
  if (!cronSecret) {
    return { error: "Cron is not configured", status: 503 };
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return { error: "Unauthorized", status: 401 };
  }

  return null;
}
