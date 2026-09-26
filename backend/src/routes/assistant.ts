/**
 * ผู้ช่วย AI: chat endpoint for the shipment assistant. Read-only: the model
 * can only call the tools in services/assistant/assistantTools.ts, all of
 * which are scoped to req.orgId.
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { registerOrgScope } from '../auth/orgScopeMiddleware.js';
import { requirePermission } from '../middleware/jwtAuth.js';
import { container, TOKENS } from '../di/index.js';
import type { ICommandBus } from '../commands/CommandBus.js';
import type { IInvoicingService } from '../services/InvoicingService.js';
import { JobReadRepository } from '../repositories/JobReadRepository.js';
import { createAssistantModel } from '../services/assistant/assistantModel.js';
import { AssistantToolExecutor } from '../services/assistant/assistantTools.js';
import { ShipmentAssistantService, type ChatTurn } from '../services/assistant/ShipmentAssistantService.js';

export async function assistantRoutes(server: FastifyInstance) {
  await registerOrgScope(server);
  // Each question can mean several model calls, so cap it per user.
  await server.register(rateLimit, { global: false });

  const model = createAssistantModel();
  const assistant = model
    ? new ShipmentAssistantService(
        model,
        new AssistantToolExecutor(new JobReadRepository(server.prisma), container.resolve<IInvoicingService>(TOKENS.IInvoicingService)),
        container.resolve<ICommandBus>(TOKENS.ICommandBus),
      )
    : null;

  server.get('/api/v1/assistant/status', {
    preHandler: requirePermission('shipments:read'),
    schema: { tags: ['Assistant'], description: 'Whether the shipment assistant is configured, and which model it uses' },
  }, async () => ({
    data: { enabled: !!assistant, provider: model?.provider ?? null, model: model?.model ?? null },
    error: null,
  }));

  server.post('/api/v1/assistant/chat', {
    preHandler: requirePermission('shipments:read'),
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (req: FastifyRequest) => (req as any).user?.sub ?? req.ip,
      },
    },
    schema: {
      tags: ['Assistant'],
      description: 'Ask the shipment assistant a question. Send the visible conversation, oldest first, ending with the user\'s question.',
      body: {
        type: 'object',
        required: ['messages'],
        additionalProperties: false,
        properties: {
          messages: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
              type: 'object',
              required: ['role', 'content'],
              additionalProperties: false,
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', minLength: 1, maxLength: 2000 },
              },
            },
          },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!assistant) {
      reply.code(503);
      return { data: null, error: 'The AI assistant is not configured' };
    }
    const { messages } = req.body as { messages: ChatTurn[] };
    if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
      reply.code(400);
      return { data: null, error: 'Conversation must start and end with a user message' };
    }

    try {
      const result = await assistant.chat(req.orgId!, (req as any).user?.sub ?? 'unknown', messages);
      return { data: result, error: null };
    } catch (err) {
      req.log.error({ err, orgId: req.orgId }, 'Assistant chat failed');
      reply.code(502);
      return { data: null, error: 'The AI assistant is unavailable right now' };
    }
  });
}
