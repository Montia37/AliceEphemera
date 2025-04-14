// 将 UTC+1 时区转换为当地时区
export function convertUTC1ToLocalTime(utcDateString: string): Date {
  const utcDate = new Date(utcDateString);
  const utcOffset = utcDate.getTimezoneOffset(); // 本地时区与 UTC 的差值(分钟)
  const utc1ToLocalOffset = (utcOffset + 60) * 60 * 1000; // (本地时区与UTC的差值+1小时) 转为毫秒
  const localTime = new Date(utcDate.getTime() - utc1ToLocalOffset);
  return localTime;
}
