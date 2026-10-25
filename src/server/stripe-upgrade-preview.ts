export interface StripePreviewWorkerEnv {
  STRIPE_SECRET_KEY?: string;
  DIRECTUS_URL?: string;
  PORTAL_ENV?: 'staging' | 'production' | string;
  STRIPE_EXPECTED_MODE?: 'test' | 'live' | string;
  STRIPE_GET_PRICES_FLOW?: string;
  APPROVED_PRICE_IDS?: string;
}

export interface DirectusAuthenticatedUser {
  id: string;
  email: string;
  status?: string;
  stripe_customer_id?: string | null;
  provider_link?: {
    id?: string | number;
    status?: string;
  } | null;
}

export interface UpgradePreviewRequestPayload {
  subscriptionId?: string;
  subscriptionItemId?: string;
  currentPriceId?: string;
  newPriceId?: string;
  targetPriceId?: string;
  isUpgrade?: boolean;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  customerEmail?: string | null;
  customerId?: string | null;
}

export interface PaymentMethodStatusRequestPayload {
  subscriptionId?: string | null;
  customerEmail?: string | null;
  customerId?: string | null;
}

const STAGING_DIRECTUS_URL = 'https://quepasa-api.c1oud7.de';
const PRODUCTION_DIRECTUS_URL = 'https://api.vamo-app.com';
const DEFAULT_PRICES_FLOW_ID = 'ccd7ae9c-27be-453e-94ef-db7d52be0e0a';
const STAGING_ALT_PRICES_FLOW_ID = 'd6d3fb70-06a0-4ab6-a9b4-c08b6ff5a0e9';
const PREVIEW_TTL_SECONDS = 300;

const SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9_]+$/;
const SUBSCRIPTION_ITEM_ID_RE = /^si_[A-Za-z0-9_]+$/;
const PRICE_ID_RE = /^price_[A-Za-z0-9_]+$/;
const CUSTOMER_ID_RE = /^cus_[A-Za-z0-9_]+$/;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  const payload =
    body && typeof body['code'] === 'string' && !('errorCode' in body)
      ? { ...body, errorCode: body['code'] }
      : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function resolveEnvironmentProfile(
  requestUrl: URL,
  env: StripePreviewWorkerEnv,
): {
  mode: 'test' | 'live';
  directusUrl: string;
  environmentMismatch: boolean;
  mismatchReason?: string;
} {
  const host = requestUrl.hostname.toLowerCase();
  const explicitEnv = (env.PORTAL_ENV || '').trim().toLowerCase();
  const explicitMode = (env.STRIPE_EXPECTED_MODE || '').trim().toLowerCase();
  const configuredDirectus = (env.DIRECTUS_URL || '').trim().replace(/\/+$/, '');

  const isStagingHost =
    host === 'staging-business.vamo-app.com' ||
    host.startsWith('staging-') ||
    host === 'localhost' ||
    host === '127.0.0.1';
  const isProdHost = host === 'business.vamo-app.com';

  let mode: 'test' | 'live' = isProdHost ? 'live' : 'test';
  if (explicitEnv === 'production' || explicitMode === 'live') {
    mode = 'live';
  } else if (explicitEnv === 'staging' || explicitMode === 'test') {
    mode = 'test';
  }

  const defaultDirectusUrl = mode === 'live' ? PRODUCTION_DIRECTUS_URL : STAGING_DIRECTUS_URL;
  const directusUrl = configuredDirectus || defaultDirectusUrl;

  let directusHost = '';
  try {
    directusHost = new URL(directusUrl).hostname.toLowerCase();
  } catch {
    return {
      mode,
      directusUrl,
      environmentMismatch: true,
      mismatchReason: 'Invalid Directus URL configuration.',
    };
  }

  // Enforce strict staging vs production separation
  if (isStagingHost && mode === 'live') {
    return {
      mode,
      directusUrl,
      environmentMismatch: true,
      mismatchReason: 'Staging host cannot use live Stripe mode.',
    };
  }
  if (isProdHost && mode === 'test') {
    return {
      mode,
      directusUrl,
      environmentMismatch: true,
      mismatchReason: 'Production host cannot use test Stripe mode.',
    };
  }
  if (mode === 'test' && directusHost === 'api.vamo-app.com') {
    return {
      mode,
      directusUrl,
      environmentMismatch: true,
      mismatchReason: 'Test Stripe mode cannot be paired with production Directus.',
    };
  }
  if (mode === 'live' && directusHost === 'quepasa-api.c1oud7.de') {
    return {
      mode,
      directusUrl,
      environmentMismatch: true,
      mismatchReason: 'Live Stripe mode cannot be paired with staging Quepasa Directus.',
    };
  }

  const secretKey = (env.STRIPE_SECRET_KEY || '').trim();
  if (secretKey) {
    const isTestKey = secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_');
    const isLiveKey = secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_');
    if (!isTestKey && !isLiveKey) {
      return {
        mode,
        directusUrl,
        environmentMismatch: true,
        mismatchReason: 'Invalid Stripe secret key format.',
      };
    }
    if (mode === 'test' && isLiveKey) {
      return {
        mode,
        directusUrl,
        environmentMismatch: true,
        mismatchReason: 'Staging/test environment must not use a live Stripe secret key.',
      };
    }
    if (mode === 'live' && isTestKey) {
      return {
        mode,
        directusUrl,
        environmentMismatch: true,
        mismatchReason: 'Production environment must not use a test Stripe secret key.',
      };
    }
  }

  return {
    mode,
    directusUrl,
    environmentMismatch: false,
  };
}

/**
 * Strictly read-only Stripe API client wrapper.
 * Rejects any mutating Stripe endpoint before fetch is invoked.
 */
export function createReadOnlyStripeClient(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): {
  get: (pathWithQuery: string) => Promise<{ ok: boolean; status: number; data: any }>;
  previewInvoice: (formParams: URLSearchParams) => Promise<{ ok: boolean; status: number; data: any }>;
  rawRequest: (method: string, pathWithQuery: string, body?: BodyInit | null) => Promise<{ ok: boolean; status: number; data: any }>;
} {
  const ALLOWED_GET_PATTERNS = [
    /^\/v1\/customers\/cus_[A-Za-z0-9_]+$/,
    /^\/v1\/customers\?/,
    /^\/v1\/subscriptions\/sub_[A-Za-z0-9_]+$/,
    /^\/v1\/subscriptions\?/,
    /^\/v1\/payment_methods\?/,
    /^\/v1\/prices\/price_[A-Za-z0-9_]+$/,
    /^\/v1\/prices\?/,
  ];

  async function rawRequest(
    method: string,
    pathWithQuery: string,
    body?: BodyInit | null,
  ): Promise<{ ok: boolean; status: number; data: any }> {
    const upperMethod = (method || '').toUpperCase();
    const normalizedPath = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;

    if (upperMethod === 'GET') {
      const allowed = ALLOWED_GET_PATTERNS.some((pattern) => pattern.test(normalizedPath));
      if (!allowed) {
        throw new Error(`READ_ONLY_STRIPE_VIOLATION: Disallowed GET path ${normalizedPath}`);
      }
    } else if (upperMethod === 'POST') {
      if (normalizedPath !== '/v1/invoices/create_preview') {
        throw new Error(`READ_ONLY_STRIPE_VIOLATION: Disallowed POST path ${normalizedPath}`);
      }
    } else {
      throw new Error(`READ_ONLY_STRIPE_VIOLATION: Disallowed HTTP method ${upperMethod}`);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    };
    if (upperMethod === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const response = await fetchImpl(`https://api.stripe.com${normalizedPath}`, {
      method: upperMethod,
      headers,
      body: upperMethod === 'POST' ? body : undefined,
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  return {
    get: (pathWithQuery: string) => rawRequest('GET', pathWithQuery),
    previewInvoice: (formParams: URLSearchParams) =>
      rawRequest('POST', '/v1/invoices/create_preview', formParams.toString()),
    rawRequest,
  };
}

function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authHeader.trim());
  return match?.[1]?.trim() || null;
}

export async function authenticateDirectusUser(
  directusUrl: string,
  bearerToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DirectusAuthenticatedUser | null> {
  const primaryFields = 'id,email,status,stripe_customer_id,provider_link.id,provider_link.status';
  const fallbackFields = 'id,email,status,provider_link.id,provider_link.status';

  let response = await fetchImpl(`${directusUrl}/users/me?fields=${encodeURIComponent(primaryFields)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 403) {
    response = await fetchImpl(`${directusUrl}/users/me?fields=${encodeURIComponent(fallbackFields)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json',
      },
    });
  }

  if (!response.ok) {
    return null;
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const user = body?.data ?? body;
  if (!user || typeof user.id !== 'string' || !user.id.trim() || typeof user.email !== 'string' || !user.email.trim()) {
    return null;
  }

  if (user.status && user.status !== 'active') {
    return null;
  }

  return {
    id: user.id.trim(),
    email: user.email.trim().toLowerCase(),
    status: user.status,
    stripe_customer_id:
      typeof user.stripe_customer_id === 'string' && user.stripe_customer_id.trim()
        ? user.stripe_customer_id.trim()
        : null,
    provider_link: user.provider_link ?? null,
  };
}

function verifyCustomerOwnership(
  user: DirectusAuthenticatedUser,
  stripeCustomer: any,
  requestedEmail?: string | null,
  requestedCustomerId?: string | null,
): { authorized: boolean; code?: string; message?: string } {
  if (!stripeCustomer || typeof stripeCustomer.id !== 'string' || stripeCustomer.deleted === true) {
    return {
      authorized: false,
      code: 'CUSTOMER_NOT_FOUND',
      message: 'Stripe customer record is unavailable.',
    };
  }

  if (requestedEmail && requestedEmail.trim().toLowerCase() !== user.email) {
    return {
      authorized: false,
      code: 'CUSTOMER_OWNERSHIP_MISMATCH',
      message: 'Authenticated user does not match requested customer email.',
    };
  }

  if (requestedCustomerId && requestedCustomerId.trim() !== stripeCustomer.id) {
    return {
      authorized: false,
      code: 'CUSTOMER_OWNERSHIP_MISMATCH',
      message: 'Requested customer ID does not match subscription customer.',
    };
  }

  if (user.stripe_customer_id && user.stripe_customer_id !== stripeCustomer.id) {
    return {
      authorized: false,
      code: 'CUSTOMER_OWNERSHIP_MISMATCH',
      message: 'Subscription customer does not match authenticated user customer.',
    };
  }

  const metaUserId = stripeCustomer.metadata?.directus_user_id || stripeCustomer.metadata?.user_id;
  if (typeof metaUserId === 'string' && metaUserId.trim() && metaUserId.trim() !== user.id) {
    return {
      authorized: false,
      code: 'CUSTOMER_OWNERSHIP_MISMATCH',
      message: 'Customer metadata belongs to a different user.',
    };
  }

  const metaProviderId = stripeCustomer.metadata?.provider_id || stripeCustomer.metadata?.business_id;
  const userProviderId = user.provider_link?.id != null ? String(user.provider_link.id).trim() : '';
  if (
    typeof metaProviderId === 'string' &&
    metaProviderId.trim() &&
    userProviderId &&
    metaProviderId.trim() !== userProviderId
  ) {
    return {
      authorized: false,
      code: 'CROSS_BUSINESS_ACCESS_DENIED',
      message: 'Subscription belongs to a different business profile.',
    };
  }

  const customerEmail =
    typeof stripeCustomer.email === 'string' ? stripeCustomer.email.trim().toLowerCase() : '';
  const directMatch = user.stripe_customer_id === stripeCustomer.id;
  const emailMatch = Boolean(customerEmail && customerEmail === user.email);
  const metadataUserMatch = Boolean(typeof metaUserId === 'string' && metaUserId.trim() === user.id);

  if (!directMatch && !emailMatch && !metadataUserMatch) {
    return {
      authorized: false,
      code: 'CUSTOMER_OWNERSHIP_MISMATCH',
      message: 'Subscription does not belong to the authenticated customer.',
    };
  }

  return { authorized: true };
}

async function resolveDefaultPaymentMethodStatus(
  stripeClient: ReturnType<typeof createReadOnlyStripeClient>,
  customerId: string,
  stripeCustomer: any,
  subscription: any | null,
): Promise<{
  paymentMethods: Array<{
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isRenewalCard: boolean;
  }>;
  defaultPaymentMethodId: string | null;
  defaultPaymentMethodSource: 'subscription' | 'customer' | null;
  subscriptionDefaultPaymentMethodId: string | null;
  customerDefaultPaymentMethodId: string | null;
  subscriptionId: string | null;
  defaultVerified: boolean;
}> {
  const custDefaultRaw = stripeCustomer?.invoice_settings?.default_payment_method;
  const customerDefaultPaymentMethodId =
    typeof custDefaultRaw === 'string' && custDefaultRaw.trim()
      ? custDefaultRaw.trim()
      : typeof custDefaultRaw?.id === 'string' && custDefaultRaw.id.trim()
        ? custDefaultRaw.id.trim()
        : null;

  let subscriptionDefaultPaymentMethodId: string | null = null;
  let resolvedSubId: string | null = null;
  if (subscription && typeof subscription.id === 'string') {
    resolvedSubId = subscription.id;
    const subDefaultRaw = subscription.default_payment_method;
    subscriptionDefaultPaymentMethodId =
      typeof subDefaultRaw === 'string' && subDefaultRaw.trim()
        ? subDefaultRaw.trim()
        : typeof subDefaultRaw?.id === 'string' && subDefaultRaw.id.trim()
          ? subDefaultRaw.id.trim()
          : null;
  }

  const defaultPaymentMethodId = subscriptionDefaultPaymentMethodId || customerDefaultPaymentMethodId || null;
  const defaultPaymentMethodSource: 'subscription' | 'customer' | null = subscriptionDefaultPaymentMethodId
    ? 'subscription'
    : customerDefaultPaymentMethodId
      ? 'customer'
      : null;

  const pmRes = await stripeClient.get(
    `/v1/payment_methods?customer=${encodeURIComponent(customerId)}&type=card`,
  );
  if (!pmRes.ok || !Array.isArray(pmRes.data?.data)) {
    return {
      paymentMethods: [],
      defaultPaymentMethodId: null,
      defaultPaymentMethodSource: null,
      subscriptionDefaultPaymentMethodId: null,
      customerDefaultPaymentMethodId: null,
      subscriptionId: resolvedSubId,
      defaultVerified: false,
    };
  }

  const seen = new Set<string>();
  const paymentMethods: Array<{
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isRenewalCard: boolean;
  }> = [];

  for (const pm of pmRes.data.data) {
    if (!pm || typeof pm.id !== 'string' || !pm.card) continue;
    const key = `${pm.card.brand}:${pm.card.last4}:${pm.card.exp_month}:${pm.card.exp_year}`;
    if (seen.has(key) && pm.id !== defaultPaymentMethodId) continue;
    seen.add(key);
    paymentMethods.push({
      id: pm.id,
      brand: String(pm.card.brand || 'card'),
      last4: String(pm.card.last4 || ''),
      expMonth: Number(pm.card.exp_month || 0),
      expYear: Number(pm.card.exp_year || 0),
      isRenewalCard: Boolean(defaultPaymentMethodId && pm.id === defaultPaymentMethodId),
    });
  }

  return {
    paymentMethods,
    defaultPaymentMethodId,
    defaultPaymentMethodSource,
    subscriptionDefaultPaymentMethodId,
    customerDefaultPaymentMethodId,
    subscriptionId: resolvedSubId,
    defaultVerified: true,
  };
}

async function fetchApprovedPriceIds(
  directusUrl: string,
  env: StripePreviewWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string> | null> {
  if (env.APPROVED_PRICE_IDS && env.APPROVED_PRICE_IDS.trim()) {
    const ids = env.APPROVED_PRICE_IDS.split(',')
      .map((s) => s.trim())
      .filter((s) => PRICE_ID_RE.test(s));
    if (ids.length > 0) {
      return new Set(ids);
    }
  }

  const flowIds = [
    env.STRIPE_GET_PRICES_FLOW?.trim() || DEFAULT_PRICES_FLOW_ID,
    STAGING_ALT_PRICES_FLOW_ID,
  ];

  for (const flowId of flowIds) {
    if (!flowId) continue;
    try {
      const res = await fetchImpl(`${directusUrl}/flows/trigger/${flowId}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const body: any = await res.json();
      const rawPlans = Array.isArray(body) ? body : Array.isArray(body?.plans) ? body.plans : Array.isArray(body?.data) ? body.data : null;
      if (Array.isArray(rawPlans) && rawPlans.length > 0) {
        const set = new Set<string>();
        for (const plan of rawPlans) {
          const id = plan?.id || plan?.priceId;
          if (typeof id === 'string' && PRICE_ID_RE.test(id.trim())) {
            set.add(id.trim());
          }
        }
        if (set.size > 0) {
          return set;
        }
      }
    } catch {
      // Continue if prices flow is unreachable; Stripe price metadata validation still runs
    }
  }

  return null;
}

export async function handleSubscriptionChangePreviewRequest(
  request: Request,
  env: StripePreviewWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(
      { error: true, code: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are supported.' },
      405,
    );
  }

  const requestUrl = new URL(request.url);
  const envProfile = resolveEnvironmentProfile(requestUrl, env);
  if (envProfile.environmentMismatch) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'STRIPE_ENVIRONMENT_MISMATCH',
        message: 'Stripe environment configuration mismatch.',
      },
      500,
    );
  }

  const secretKey = (env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'STRIPE_CREDENTIALS_MISSING',
        message: 'Stripe preview service is not configured.',
      },
      503,
    );
  }

  const bearerToken = extractBearerToken(request);
  if (!bearerToken) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
      401,
    );
  }

  const authUser = await authenticateDirectusUser(envProfile.directusUrl, bearerToken, fetchImpl);
  if (!authUser) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication session.',
      },
      401,
    );
  }

  let payload: UpgradePreviewRequestPayload;
  try {
    payload = (await request.json()) as UpgradePreviewRequestPayload;
  } catch {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'INVALID_REQUEST_BODY',
        message: 'Invalid JSON request body.',
      },
      400,
    );
  }

  const subscriptionId = typeof payload?.subscriptionId === 'string' ? payload.subscriptionId.trim() : '';
  const subscriptionItemId =
    typeof payload?.subscriptionItemId === 'string' ? payload.subscriptionItemId.trim() : '';
  const targetPriceId =
    typeof payload?.newPriceId === 'string' && payload.newPriceId.trim()
      ? payload.newPriceId.trim()
      : typeof payload?.targetPriceId === 'string' && payload.targetPriceId.trim()
        ? payload.targetPriceId.trim()
        : '';

  if (!SUBSCRIPTION_ID_RE.test(subscriptionId) || !SUBSCRIPTION_ITEM_ID_RE.test(subscriptionItemId)) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'INVALID_SUBSCRIPTION_ID',
        message: 'Invalid subscription or subscription item identifier.',
      },
      400,
    );
  }

  if (!PRICE_ID_RE.test(targetPriceId)) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'INVALID_TARGET_PRICE',
        message: 'Invalid target Stripe Price ID.',
      },
      400,
    );
  }

  const stripeClient = createReadOnlyStripeClient(secretKey, fetchImpl);

  // 1. Fetch authoritative subscription from Stripe
  const subRes = await stripeClient.get(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (!subRes.ok || !subRes.data || subRes.data.id !== subscriptionId) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'INVALID_SUBSCRIPTION_ID',
        message: 'Subscription could not be found in Stripe.',
      },
      404,
    );
  }

  const subscription = subRes.data;
  const subCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer.trim()
      : typeof subscription.customer?.id === 'string'
        ? subscription.customer.id.trim()
        : '';

  if (!CUSTOMER_ID_RE.test(subCustomerId)) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Subscription has no valid Stripe customer.',
      },
      400,
    );
  }

  // 2. Fetch authoritative customer from Stripe and verify ownership
  const custRes = await stripeClient.get(`/v1/customers/${encodeURIComponent(subCustomerId)}`);
  if (!custRes.ok || !custRes.data) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Stripe customer could not be retrieved.',
      },
      404,
    );
  }

  const ownership = verifyCustomerOwnership(
    authUser,
    custRes.data,
    payload.customerEmail,
    payload.customerId,
  );
  if (!ownership.authorized) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: ownership.code || 'CUSTOMER_OWNERSHIP_MISMATCH',
        message: ownership.message || 'Unauthorized subscription access.',
      },
      403,
    );
  }

  // 3. Verify subscription status & subscription item
  if (!['active', 'trialing'].includes(String(subscription.status || ''))) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'SUBSCRIPTION_NOT_ACTIVE',
        message: 'Subscription is not in an active state for plan changes.',
      },
      409,
    );
  }

  const items: any[] = Array.isArray(subscription.items?.data) ? subscription.items.data : [];
  const currentItem = items.find((item) => item && item.id === subscriptionItemId);
  if (!currentItem || !currentItem.price) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'SUBSCRIPTION_ITEM_MISMATCH',
        message: 'Subscription item does not belong to this subscription.',
      },
      400,
    );
  }

  const liveCurrentPriceId = String(currentItem.price.id || '');
  const liveCurrentAmount = Number(currentItem.price.unit_amount ?? 0);
  const liveCurrency = String(currentItem.price.currency || subscription.currency || 'usd').toLowerCase();

  if (
    typeof payload.currentPriceId === 'string' &&
    payload.currentPriceId.trim() &&
    payload.currentPriceId.trim() !== liveCurrentPriceId
  ) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'SUBSCRIPTION_STATE_CHANGED',
        message: 'Subscription plan changed since the review was opened.',
      },
      409,
    );
  }

  if (
    typeof payload.currentPeriodEnd === 'number' &&
    Number.isFinite(payload.currentPeriodEnd) &&
    typeof subscription.current_period_end === 'number' &&
    payload.currentPeriodEnd !== subscription.current_period_end
  ) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'expired',
        code: 'PREVIEW_STALE_PERIOD_CHANGED',
        message: 'Subscription billing period changed.',
      },
      409,
    );
  }

  if (targetPriceId === liveCurrentPriceId) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'INVALID_TARGET_PRICE',
        message: 'Target plan is already the active subscription plan.',
      },
      400,
    );
  }

  // 4. Validate target Price ID against approved plan choices and Stripe price metadata
  const approvedPrices = await fetchApprovedPriceIds(envProfile.directusUrl, env, fetchImpl);
  if (approvedPrices && !approvedPrices.has(targetPriceId)) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'INVALID_TARGET_PRICE',
        message: 'Target Price ID is not an approved VAMO subscription plan.',
      },
      400,
    );
  }

  const priceRes = await stripeClient.get(`/v1/prices/${encodeURIComponent(targetPriceId)}`);
  if (
    !priceRes.ok ||
    !priceRes.data ||
    priceRes.data.active !== true ||
    priceRes.data.type !== 'recurring' ||
    String(priceRes.data.currency || '').toLowerCase() !== liveCurrency ||
    typeof priceRes.data.unit_amount !== 'number' ||
    priceRes.data.unit_amount <= liveCurrentAmount
  ) {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'INVALID_TARGET_PRICE',
        message: 'Target Price ID is not a valid active recurring upgrade price.',
      },
      400,
    );
  }

  const targetPrice = priceRes.data;
  const previewTimestamp = Math.floor(Date.now() / 1000);

  // 5. Call Stripe read-only Invoice Preview API
  const formParams = new URLSearchParams();
  formParams.set('customer', subCustomerId);
  formParams.set('subscription', subscriptionId);
  formParams.set('subscription_details[items][0][id]', subscriptionItemId);
  formParams.set('subscription_details[items][0][price]', targetPriceId);
  formParams.set('subscription_details[proration_behavior]', 'always_invoice');
  formParams.set('subscription_details[proration_date]', String(previewTimestamp));

  const previewRes = await stripeClient.previewInvoice(formParams);
  if (!previewRes.ok || !previewRes.data || typeof previewRes.data.amount_due !== 'number') {
    return jsonResponse(
      {
        error: true,
        verified: false,
        verificationStatus: 'unavailable',
        code: 'STRIPE_PREVIEW_FAILED',
        message: 'Unable to retrieve authoritative invoice preview from Stripe.',
      },
      502,
    );
  }

  const invoice = previewRes.data;
  const lines: any[] = Array.isArray(invoice.lines?.data) ? invoice.lines.data : [];
  let prorationDelta = 0;
  let hasProrationLines = false;
  for (const line of lines) {
    const isProration =
      line?.proration === true || line?.parent?.subscription_item_details?.proration === true;
    if (isProration && typeof line.amount === 'number') {
      prorationDelta += line.amount;
      hasProrationLines = true;
    }
  }
  const subtotal = typeof invoice.subtotal === 'number' ? invoice.subtotal : invoice.amount_due;
  if (!hasProrationLines) {
    prorationDelta = subtotal;
  }

  const discountAmounts: any[] = Array.isArray(invoice.total_discount_amounts)
    ? invoice.total_discount_amounts
    : [];
  const discountAmount = discountAmounts.reduce(
    (sum, d) => sum + (typeof d?.amount === 'number' ? d.amount : 0),
    0,
  );

  const taxAmounts: any[] = Array.isArray(invoice.total_taxes)
    ? invoice.total_taxes
    : Array.isArray(invoice.total_tax_amounts)
      ? invoice.total_tax_amounts
      : [];
  const tax =
    taxAmounts.length > 0
      ? taxAmounts.reduce((sum, t) => sum + (typeof t?.amount === 'number' ? t.amount : 0), 0)
      : typeof invoice.tax === 'number'
        ? invoice.tax
        : 0;

  // 6. Inspect subscription/customer default payment method (read-only)
  const pmStatus = await resolveDefaultPaymentMethodStatus(
    stripeClient,
    subCustomerId,
    custRes.data,
    subscription,
  );

  return jsonResponse({
    verified: true,
    verificationStatus: 'verified',
    isUpgrade: true,
    timing: 'immediate',
    customerId: subCustomerId,
    subscriptionId,
    subscriptionItemId,
    currentPriceId: liveCurrentPriceId,
    targetPriceId,
    newPriceId: targetPriceId,
    currency: String(invoice.currency || liveCurrency).toLowerCase(),
    subtotal,
    prorationDelta,
    discountAmount,
    tax,
    amountDueToday: invoice.amount_due,
    renewalAmount: targetPrice.unit_amount,
    renewalInterval: targetPrice.recurring?.interval === 'year' ? 'year' : 'month',
    previewTimestamp,
    effectiveDate: previewTimestamp,
    currentPeriodStart: subscription.current_period_start ?? payload.currentPeriodStart ?? null,
    currentPeriodEnd: subscription.current_period_end ?? payload.currentPeriodEnd ?? null,
    nextBillingDate: subscription.current_period_end ?? payload.currentPeriodEnd ?? null,
    expiresAt: (previewTimestamp + PREVIEW_TTL_SECONDS) * 1000,
    promoSupported: false,
    couponState: 'not_applied',
    // Unchanged Directus Flow 2b1a4494-8999-4c27-b70e-ddcc47bb16f3 does not enforce proration_date or approvedAmountDue
    chargeAmountEnforcedByServer: false,
    defaultPaymentMethodId: pmStatus.defaultPaymentMethodId,
    defaultPaymentMethodSource: pmStatus.defaultPaymentMethodSource,
    defaultPaymentMethodVerified: pmStatus.defaultVerified,
  });
}

export async function handlePaymentMethodStatusRequest(
  request: Request,
  env: StripePreviewWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(
      { error: true, code: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are supported.' },
      405,
    );
  }

  const requestUrl = new URL(request.url);
  const envProfile = resolveEnvironmentProfile(requestUrl, env);
  if (envProfile.environmentMismatch) {
    return jsonResponse(
      {
        error: true,
        defaultVerified: false,
        code: 'STRIPE_ENVIRONMENT_MISMATCH',
        message: 'Stripe environment configuration mismatch.',
      },
      500,
    );
  }

  const secretKey = (env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return jsonResponse(
      {
        error: true,
        defaultVerified: false,
        code: 'STRIPE_CREDENTIALS_MISSING',
        message: 'Stripe payment-method verification service is not configured.',
      },
      503,
    );
  }

  const bearerToken = extractBearerToken(request);
  if (!bearerToken) {
    return jsonResponse(
      {
        error: true,
        defaultVerified: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
      401,
    );
  }

  const authUser = await authenticateDirectusUser(envProfile.directusUrl, bearerToken, fetchImpl);
  if (!authUser) {
    return jsonResponse(
      {
        error: true,
        defaultVerified: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication session.',
      },
      401,
    );
  }

  let payload: PaymentMethodStatusRequestPayload = {};
  try {
    payload = (await request.json()) as PaymentMethodStatusRequestPayload;
  } catch {
    payload = {};
  }

  if (payload.customerEmail && payload.customerEmail.trim().toLowerCase() !== authUser.email) {
    return jsonResponse(
      {
        error: true,
        defaultVerified: false,
        code: 'CUSTOMER_OWNERSHIP_MISMATCH',
        message: 'Authenticated user does not match requested customer email.',
      },
      403,
    );
  }

  const stripeClient = createReadOnlyStripeClient(secretKey, fetchImpl);
  const requestedSubId =
    typeof payload.subscriptionId === 'string' && payload.subscriptionId.trim()
      ? payload.subscriptionId.trim()
      : null;

  let subscription: any = null;
  let customerId = authUser.stripe_customer_id || null;

  if (requestedSubId) {
    if (!SUBSCRIPTION_ID_RE.test(requestedSubId)) {
      return jsonResponse(
        {
          error: true,
          defaultVerified: false,
          code: 'INVALID_SUBSCRIPTION_ID',
          message: 'Invalid subscription ID format.',
        },
        400,
      );
    }
    const subRes = await stripeClient.get(`/v1/subscriptions/${encodeURIComponent(requestedSubId)}`);
    if (!subRes.ok || !subRes.data) {
      return jsonResponse(
        {
          error: true,
          defaultVerified: false,
          code: 'INVALID_SUBSCRIPTION_ID',
          message: 'Subscription not found.',
        },
        404,
      );
    }
    subscription = subRes.data;
    const subCustId =
      typeof subscription.customer === 'string'
        ? subscription.customer.trim()
        : subscription.customer?.id?.trim() || null;
    if (customerId && subCustId && customerId !== subCustId) {
      return jsonResponse(
        {
          error: true,
          defaultVerified: false,
          code: 'CUSTOMER_OWNERSHIP_MISMATCH',
          message: 'Subscription does not belong to the authenticated customer.',
        },
        403,
      );
    }
    customerId = subCustId;
  }

  if (!customerId) {
    const searchRes = await stripeClient.get(
      `/v1/customers?email=${encodeURIComponent(authUser.email)}&limit=5`,
    );
    if (!searchRes.ok || !Array.isArray(searchRes.data?.data)) {
      return jsonResponse(
        {
          error: true,
          defaultVerified: false,
          code: 'STRIPE_LOOKUP_FAILED',
          message: 'Unable to look up customer in Stripe.',
        },
        502,
      );
    }
    const activeCustomers = searchRes.data.data.filter((c: any) => c && !c.deleted);
    if (activeCustomers.length === 0) {
      return jsonResponse({
        paymentMethods: [],
        defaultPaymentMethodId: null,
        defaultPaymentMethodSource: null,
        subscriptionDefaultPaymentMethodId: null,
        customerDefaultPaymentMethodId: null,
        subscriptionId: null,
        defaultVerified: true,
      });
    }
    customerId = activeCustomers[0].id;
  }

  const custRes = await stripeClient.get(`/v1/customers/${encodeURIComponent(customerId!)}`);
  if (!custRes.ok || !custRes.data) {
    return jsonResponse(
      {
        error: true,
        defaultVerified: false,
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Stripe customer could not be retrieved.',
      },
      404,
    );
  }

  const ownership = verifyCustomerOwnership(
    authUser,
    custRes.data,
    payload.customerEmail,
    payload.customerId,
  );
  if (!ownership.authorized) {
    return jsonResponse(
      {
        error: true,
        defaultVerified: false,
        code: ownership.code || 'CUSTOMER_OWNERSHIP_MISMATCH',
        message: ownership.message || 'Unauthorized customer access.',
      },
      403,
    );
  }

  if (!subscription) {
    const subsRes = await stripeClient.get(
      `/v1/subscriptions?customer=${encodeURIComponent(customerId!)}&status=all&limit=10`,
    );
    if (subsRes.ok && Array.isArray(subsRes.data?.data)) {
      subscription =
        subsRes.data.data.find((s: any) =>
          ['active', 'trialing', 'past_due', 'unpaid'].includes(String(s?.status || '')),
        ) ?? null;
    }
  }

  const statusResult = await resolveDefaultPaymentMethodStatus(
    stripeClient,
    customerId!,
    custRes.data,
    subscription,
  );

  return jsonResponse(statusResult, statusResult.defaultVerified ? 200 : 502);
}
