// 将任意时区时间转换为本地时间
export function convertTimezoneToLocal(timeString: string): string {
  const date = new Date(timeString);
  const year = date.getFullYear();
  // getMonth() 返回 0-11，所以需要 +1
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
