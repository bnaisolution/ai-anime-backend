import { FastifyInstance } from 'fastify';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', async (_request, reply) => {
    return reply.code(503).send({
      status: 'failed',
      errors: [{
        category: 'AUTH_NOT_CONFIGURED',
        message: 'Password authentication is disabled: no verified credential store is configured.'
      }]
    });
  });

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request) => {
    return { status: 'completed', user: request.authContext };
  });
}
