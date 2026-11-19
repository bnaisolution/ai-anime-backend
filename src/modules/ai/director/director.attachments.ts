import crypto from 'crypto';
import { animeSupabase } from '../../anime/db/anime.supabase';

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export interface DirectorAttachmentPublic {
  id: string;
  filename: string;
  mime_type: string;
  kind: 'image' | 'file';
  size_bytes: number;
  created_at: string;
}

export interface DirectorAttachmentContent extends DirectorAttachmentPublic {
  data_base64: string | null;
  text_content: string | null;
}

function isMissingRelation(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code || '');
  const message = String((error as { message?: unknown })?.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message);
}

function textLike(mime: string): boolean {
  return mime.startsWith('text/') || [
    'application/json',
    'application/xml',
    'application/x-yaml',
    'application/yaml',
    'application/csv',
  ].includes(mime);
}

function toPublic(row: Record<string, unknown>): DirectorAttachmentPublic {
  return {
    id: String(row.id || ''),
    filename: String(row.filename || 'attachment'),
    mime_type: String(row.mime_type || 'application/octet-stream'),
    kind: row.kind === 'image' ? 'image' : 'file',
    size_bytes: Number(row.size_bytes) || 0,
    created_at: String(row.created_at || ''),
  };
}

export async function saveDirectorAttachment(input: {
  userId: string;
  projectId: string;
  conversationId?: string | null;
  filename: string;
  mimeType: string;
  dataBase64: string;
}): Promise<DirectorAttachmentPublic> {
  const filename = String(input.filename || 'attachment').trim().slice(0, 200) || 'attachment';
  const mimeType = String(input.mimeType || 'application/octet-stream').trim().toLowerCase();
  const raw = String(input.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw) throw Object.assign(new Error('Attachment data is required.'), { code: 'INVALID_INPUT' });

  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, 'base64');
  } catch {
    throw Object.assign(new Error('Attachment is not valid base64.'), { code: 'INVALID_INPUT' });
  }
  if (bytes.length === 0) throw Object.assign(new Error('Attachment is empty.'), { code: 'INVALID_INPUT' });
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw Object.assign(new Error('Attachment exceeds the 2 MB limit.'), { code: 'INVALID_INPUT' });
  }

  const kind: 'image' | 'file' = IMAGE_TYPES.has(mimeType) ? 'image' : 'file';
  let textContent: string | null = null;
  if (kind === 'file' && textLike(mimeType)) {
    textContent = bytes.toString('utf8').slice(0, MAX_TEXT_CHARS);
  }

  const record = {
    id: crypto.randomUUID(),
    user_id: input.userId,
    project_id: input.projectId,
    conversation_id: input.conversationId || null,
    filename,
    mime_type: mimeType,
    kind,
    size_bytes: bytes.length,
    data_base64: kind === 'image' ? bytes.toString('base64') : null,
    text_content: textContent,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const { data, error } = await animeSupabase
    .from('director_message_attachments')
    .insert(record)
    .select('id, filename, mime_type, kind, size_bytes, created_at')
    .single();
  if (error) {
    if (isMissingRelation(error)) {
      throw Object.assign(new Error('Attachment storage is not migrated yet.'), { code: 'SETUP_REQUIRED', missing: ['database'] });
    }
    throw Object.assign(new Error('Could not save the attachment.'), { code: 'ATTACHMENT_SAVE_FAILED' });
  }
  return toPublic(data as Record<string, unknown>);
}

export async function loadDirectorAttachments(
  userId: string,
  projectId: string,
  ids: string[]
): Promise<DirectorAttachmentContent[]> {
  const wanted = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 5);
  if (wanted.length === 0) return [];
  try {
    const { data, error } = await animeSupabase
      .from('director_message_attachments')
      .select('id, filename, mime_type, kind, size_bytes, data_base64, text_content, created_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .in('id', wanted);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map((row) => ({
      ...toPublic(row),
      data_base64: row.data_base64 ? String(row.data_base64) : null,
      text_content: row.text_content ? String(row.text_content) : null,
    }));
  } catch {
    return [];
  }
}

export async function deleteDirectorAttachment(userId: string, projectId: string, id: string): Promise<boolean> {
  const { error } = await animeSupabase
    .from('director_message_attachments')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .eq('project_id', projectId);
  return !error;
}

export function attachmentPromptBlock(attachments: DirectorAttachmentContent[]): string {
  if (attachments.length === 0) return '';
  const blocks = attachments.map((attachment) => {
    if (attachment.kind === 'image') {
      return `[Attached image: ${attachment.filename} (${attachment.mime_type}, ${attachment.size_bytes} bytes)]`;
    }
    if (attachment.text_content) {
      return `[Attached file: ${attachment.filename}]\n${attachment.text_content}`;
    }
    return `[Attached file: ${attachment.filename} (${attachment.mime_type}, ${attachment.size_bytes} bytes) — binary content not inlined]`;
  });
  return `\n\nAttachments:\n${blocks.join('\n\n')}`;
}
