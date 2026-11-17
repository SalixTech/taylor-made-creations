import type { OwnerContent } from './model';
const statusFields = ['commissions.statusOpen','commissions.statusClosed','commissions.statusWaitlist','commissions.statusOpeningSoon'] as const;
/** Availability wording is a live Hub value, never writable canvas copy. */
export function commissionStatusTemplateKey(status: OwnerContent['site']['commissionStatus']): typeof statusFields[number] {
  return status === 'Closed' ? 'commissions.statusClosed' : status === 'Waitlist' ? 'commissions.statusWaitlist' : status === 'Open!' ? 'commissions.statusOpen' : 'commissions.statusOpeningSoon';
}
export function isCommissionStatusTemplateKey(key: string): boolean { return (statusFields as readonly string[]).includes(key); }
export function isCommissionStatusValueTarget(target: string | null | undefined): boolean {
  return target === 'canvas:layout.commissions.statusValue' || !!target && /^canvas:layout\.block:[^:]+:[^:]+:status-value$/.test(target);
}
