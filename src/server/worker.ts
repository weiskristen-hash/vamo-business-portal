import {
  StripePreviewWorkerEnv,
  handlePaymentMethodStatusRequest,
  handleSubscriptionChangePreviewRequest,
} from './stripe-upgrade-preview';

export interface WorkerAssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface PortalWorkerEnv extends StripePreviewWorkerEnv {
  ASSETS?: WorkerAssetsBinding;
}

export default {
  async fetch(request: Request, env: PortalWorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/billing/subscription-change-preview') {
      return handleSubscriptionChangePreviewRequest(request, env);
    }

    if (url.pathname === '/api/billing/payment-method-status') {
      return handlePaymentMethodStatusRequest(request, env);
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
