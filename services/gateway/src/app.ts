import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import express, { type ErrorRequestHandler, type Express, type Response } from 'express';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { GatewayConfig } from './config';
import { sendError } from './errors';
import { requestIdMiddleware } from './middleware/requestId';
import { createTokenBucketMiddleware } from './middleware/tokenBucket';
import { authBodyValidator } from './middleware/validate';

// 'trust proxy' is intentionally left off: clients connect to the gateway directly,
// so any X-Forwarded-For header they send is untrusted and req.ip must be the socket address.
export function createApp(config: GatewayConfig): Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(helmet());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Order matters (TRD SR-09): rate limit first, then parse and validate, then proxy.
  app.use('/api/auth', createTokenBucketMiddleware(config.tokenBucket));
  app.use('/api/auth', authBodyValidator);

  app.use(
    createProxyMiddleware({
      target: config.orchestratorUrl,
      pathFilter: '/api',
      proxyTimeout: 5000,
      timeout: 5000,
      on: {
        proxyReq: prepareOrchestratorRequest,
        error: handleOrchestratorError,
      },
    }),
  );

  // Live updates for the operations console. The orchestrator only accepts a
  // socket that presents an administrator's session in its handshake.
  app.use(
    createProxyMiddleware({
      target: config.orchestratorUrl,
      pathFilter: '/socket.io',
      ws: true,
      on: { error: handleOrchestratorError },
    }),
  );

  app.use((_req, res) => {
    sendError(res, 'NOT_FOUND');
  });
  app.use(handleUnexpectedError);

  return app;
}

function prepareOrchestratorRequest(proxyReq: ClientRequest, req: IncomingMessage): void {
  // The internal token is a service credential shared by the backend services.
  // A client must never be able to present one, so it is dropped here.
  proxyReq.removeHeader('X-Internal-Token');

  // Replace any client-supplied X-Forwarded-For with the real connection address,
  // so the orchestrator always scores the true client IP.
  const clientIp = req.socket.remoteAddress;
  if (clientIp) {
    proxyReq.setHeader('X-Forwarded-For', clientIp);
  } else {
    proxyReq.removeHeader('X-Forwarded-For');
  }

  // express.json() already read the body stream on validated routes, so write it back out.
  const expressReq = req as unknown as express.Request;
  if (expressReq.body && Object.keys(expressReq.body).length > 0) {
    const bodyData = JSON.stringify(expressReq.body);
    // The body now has a known length. Sending Transfer-Encoding and Content-Length
    // together makes Node's HTTP parser reject the request with 400.
    proxyReq.removeHeader('Transfer-Encoding');
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }
}

function handleOrchestratorError(
  error: Error,
  req: IncomingMessage,
  res: ServerResponse | Socket,
): void {
  console.error(`Orchestrator request failed [${req.headers['x-request-id']}]: ${error.message}`);

  // The proxy passes Express's own response object for HTTP requests.
  if ('headersSent' in res && !res.headersSent) {
    sendError(res as Response, 'SERVICE_UNAVAILABLE');
  }
}

const handleUnexpectedError: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  // express.json() marks malformed, oversized or wrongly encoded bodies with a 4xx status.
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    // Log only the error type: body-parser attaches the raw request body (which can hold
    // an OTP code or a signature) to the error object.
    const errorType = (error as { type?: unknown }).type ?? status;
    console.error(`Rejected request body [${res.locals.requestId}]: ${String(errorType)}`);
    sendError(res, 'INVALID_REQUEST');
    return;
  }

  console.error(`Unexpected gateway error [${res.locals.requestId}]:`, error);
  sendError(res, 'INTERNAL_ERROR');
};
