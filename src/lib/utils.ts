import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui 标准 cn()：合并 class、消解 Tailwind 冲突
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
