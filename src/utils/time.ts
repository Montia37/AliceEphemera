// 将任意时区时间转换为本地时间
export function convertTimezoneToLocal(
  timeString: string,
  sourceTimezone: string = "Europe/London"
): Date {
  const parsedDate = new Date(timeString);
  const now = new Date();

  const nowInSourceTZ = new Date(
    now.toLocaleString("en-US", { timeZone: sourceTimezone })
  );
  const nowInLocalTZ = new Date(
    now.toLocaleString("en-US", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  );

  const timezoneOffset = nowInLocalTZ.getTime() - nowInSourceTZ.getTime();

  return new Date(parsedDate.getTime() + timezoneOffset);
}
