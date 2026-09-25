import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toLocalISOString(dateStr: string | Date): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const tzOffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
  const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  return localISOTime;
}
