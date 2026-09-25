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

// Round-2 M24: report timestamps must render in Asia/Kolkata explicitly.
// Bare toLocaleString() renders in the VIEWER's timezone — an evaluator in
// another timezone would see a different wall-clock time than the student
// who sat the exam, and exported reports would disagree with each other.
export function formatIST(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}
