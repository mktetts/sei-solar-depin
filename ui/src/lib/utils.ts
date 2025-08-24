import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSEIAmount(amount: bigint | string | number): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(amount);
  const formatted = Number(value) / 1e18;
  return formatted.toFixed(8);
}

export function parseSEIAmount(amount: string): bigint {
  const num = parseFloat(amount);
  return BigInt(Math.floor(num * 1e18));
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function convertMicrodegreesToDecimal(microdegrees: bigint): number {
  return Number(microdegrees) / 1_000_000;
}

export function convertDecimalToMicrodegrees(decimal: number): bigint {
  return BigInt(Math.floor(decimal * 1_000_000));
}