import {
  CheckoutBackendEnv,
  handleCheckoutApiRequest,
  redactServerValue,
} from './verified-checkout-backend';

export interface WorkerEnv extends CheckoutBackendEnv {
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const checkoutResponse = await handleCheckoutApiRequest(request, {
      env,
      onAuditEvent: (event) => {
        console.info(
          '[VamoVerifiedCheckoutAudit]',
          JSON.stringify(redactServerValue(event)),
        );
      },
    });

    if (checkoutResponse) {
      return checkoutResponse;
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
