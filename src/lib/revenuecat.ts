// Chapter Plus through RevenueCat Web Billing.
//
// The SDK is loaded on demand (only when someone opens Plus) and configured
// with the Supabase user id as the RevenueCat app user id, so purchases are
// tied to the signed-in account. The client never decides access: after a
// purchase the app asks the revenuecat-sync function, which verifies with
// RevenueCat on the server and records the entitlement.
import type { CustomerInfo, Package } from '@revenuecat/purchases-js';
import { env } from './env';

export const plusAvailable = env.revenuecatKey.length > 0;

type Sdk = typeof import('@revenuecat/purchases-js');
let sdkPromise: Promise<Sdk> | null = null;
let configuredFor: string | null = null;

async function sdkFor(userId: string): Promise<Sdk> {
  sdkPromise ??= import('@revenuecat/purchases-js');
  const m = await sdkPromise;
  if (!m.Purchases.isConfigured()) {
    m.Purchases.configure({ apiKey: env.revenuecatKey, appUserId: userId });
  } else if (configuredFor !== userId) {
    await m.Purchases.getSharedInstance().changeUser(userId);
  }
  configuredFor = userId;
  return m;
}

export interface PlusStatus {
  active: boolean;
  willRenew: boolean;
  expiresAt: Date | null;
  managementURL: string | null;
}

export interface PlusOffer {
  pkg: Package;
  title: string;
  price: string;
  period: string | null;
  sandbox: boolean;
}

function statusOf(info: CustomerInfo): PlusStatus {
  const ent = info.entitlements.active[env.revenuecatEntitlement];
  return {
    active: !!ent,
    willRenew: !!ent?.willRenew,
    expiresAt: ent?.expirationDate ?? null,
    managementURL: info.managementURL,
  };
}

/** ISO 8601 period (P1M, P1Y, P1W) in words. */
export function periodLabel(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^P(\d+)([DWMY])$/.exec(iso);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[m[2] as 'D' | 'W' | 'M' | 'Y'];
  return n === 1 ? unit : `${n} ${unit}s`;
}

export async function loadPlus(userId: string): Promise<{ status: PlusStatus; offer: PlusOffer | null }> {
  const m = await sdkFor(userId);
  const purchases = m.Purchases.getSharedInstance();
  const [info, offerings] = await Promise.all([purchases.getCustomerInfo(), purchases.getOfferings()]);
  const pkg = offerings.current?.availablePackages[0] ?? null;
  return {
    status: statusOf(info),
    offer: pkg ? {
      pkg,
      title: pkg.product.title || pkg.product.displayName,
      price: pkg.product.currentPrice.formattedPrice,
      period: periodLabel(pkg.product.normalPeriodDuration),
      sandbox: purchases.isSandbox(),
    } : null,
  };
}

/** Opens RevenueCat's checkout. Resolves null if the student closes it. */
export async function buyPlus(userId: string, pkg: Package, email?: string | null): Promise<PlusStatus | null> {
  const m = await sdkFor(userId);
  try {
    const { customerInfo } = await m.Purchases.getSharedInstance().purchase({ rcPackage: pkg, customerEmail: email ?? undefined });
    return statusOf(customerInfo);
  } catch (e) {
    if (e instanceof m.PurchasesError && e.errorCode === m.ErrorCode.UserCancelledError) return null;
    throw e;
  }
}
