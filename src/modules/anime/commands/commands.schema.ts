import { Type, type Static } from '@sinclair/typebox';
import { CommandIntent } from './commands.types';

export const ExecutionModeSchema = Type.Union([
  Type.Literal('QUICK'),
  Type.Literal('SAVE'),
]);

export const ProjectStyleSchema = Type.Object(
  {
    visual_style: Type.Union([Type.Literal('ANIME'), Type.Literal('REALISTIC')]),
  },
  { additionalProperties: true }
);

export const CreateCommandBodySchema = Type.Object(
  {
    intent: Type.Enum(CommandIntent),
    project_id: Type.String({ format: 'uuid' }),
    payload: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    mode: Type.Optional(ExecutionModeSchema),
    episode_no: Type.Optional(Type.Integer({ minimum: 1, maximum: 9999 })),
    season_no: Type.Optional(Type.Integer({ minimum: 1, maximum: 999 })),
    userPrompt: Type.Optional(Type.String()),
    project_style: Type.Optional(ProjectStyleSchema),
    user_infrastructure: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false }
);

export type CreateCommandBody = Static<typeof CreateCommandBodySchema>;

export const CommandIdParamsSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
  },
  { additionalProperties: false }
);

export type CommandIdParams = Static<typeof CommandIdParamsSchema>;
