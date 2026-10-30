import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { env } from '../../config/env';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', async (request, reply) => {
    const body = (request.body as { email?: string; password?: string }) || {};
    const email = (body.email || '').trim().toLowerCase();
    const password = (body.password || '').trim();

    if (!email || !password) return reply.code(400).send({ status: 'failed', errors: [{ category: 'INVALID_INPUT', message: 'email and password required' }] });

    let userId = crypto.randomUUID();
    let workspaceId = env.DEFAULT_WORKSPACE_ID;

    try {
      let { data: userRow } = await fastify.supabase.from('users').select('id').eq('email', email).maybeSingle();
      
      if (!userRow) {
        // New User Provisioning
        const { data: newUser } = await fastify.supabase.from('users').insert({ id: userId, email, status: 'active' }).select().single();
        userRow = newUser;
        
        // Create Default Workspace
        const newWsId = crypto.randomUUID();
        await fastify.supabase.from('workspaces').insert({ id: newWsId, name: `${email}'s Workspace`, type: 'personal' });
        await fastify.supabase.from('workspace_memberships').insert({ workspace_id: newWsId, user_id: userId, role: 'owner' });
        workspaceId = newWsId;

        // Create Default Project
        const newProjId = crypto.randomUUID();
        await fastify.supabase.from('projects').insert({ id: newProjId, workspace_id: workspaceId, name: 'BNAI Default Project', status: 'Active', is_active: true });
      } else {
        userId = userRow.id;
        const { data: memberRow } = await fastify.supabase.from('workspace_memberships').select('workspace_id').eq('user_id', userId).limit(1).maybeSingle();
        if (memberRow) workspaceId = memberRow.workspace_id;
      }
    } catch (e) {
      fastify.log.warn(e, 'Provisioning failed, using defaults');
    }

    const isOwner = env.OWNER_EMAILS.includes(email);
    const role = isOwner ? 'owner_admin' : 'normal_user';

    const token = fastify.jwt.sign({ sub: userId, workspace_id: workspaceId, email, role }, { expiresIn: '7d' });
    return reply.send({ token, access_token: token, user_id: userId, workspace_id: workspaceId, email, role });
  });

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request) => {
    return { status: 'completed', user: request.authContext };
  });
}
