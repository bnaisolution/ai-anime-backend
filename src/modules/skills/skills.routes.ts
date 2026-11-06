import { FastifyInstance } from 'fastify';
export default async function skillsRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const isOwner = request.authContext.role === 'owner_admin';
    const { data, error } = await fastify.supabase.from('skills').select('*').eq('status', 'active');

    if (error) return reply.code(500).send({ status: 'failed', errors: [{ category: 'INTERNAL_ERROR', message: error.message }] });

    const mappedSkills = (data || []).filter((s: any) => {
        const ownerOnly = s.metadata?.owner_only === true;
        return isOwner || !ownerOnly;
    }).map((s: any) => ({
        key: s.skill_key,
        name: s.name,
        description: s.description || '',
        owner_only: s.metadata?.owner_only === true
    }));

    return reply.send({ status: 'completed', skills: mappedSkills });
  });
}
