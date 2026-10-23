export interface WorkerAssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface PortalWorkerEnv {
  ASSETS?: WorkerAssetsBinding;
}

export default {
  async fetch(request: Request, env: PortalWorkerEnv): Promise<Response> {
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
