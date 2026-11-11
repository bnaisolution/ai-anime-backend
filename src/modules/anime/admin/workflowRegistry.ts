export interface AnimeWorkflowEntry {
  key: string;
  id: string;
  file: string;
  name: string;
}

export const ANIME_WORKFLOW_REGISTRY: readonly AnimeWorkflowEntry[] = [
  { key: 'WF-00', id: 'U4pLz7pXmG2OqXlt', file: 'StoryWF-00_Main_Router.json', name: 'StoryWF-00_Main_Router' },
  { key: 'WF-01', id: 'UeEXeimGGwqIh84T', file: 'StoryWF-01.json', name: 'StoryWF-01' },
  { key: 'WF-02', id: 'qRUdhg1PNDK2wJk6', file: 'storywf02.json', name: 'storywf02' },
  { key: 'WF-03', id: 's4RGuFSDlevgD5nC', file: 'storywf03.json', name: 'storywf03' },
  { key: 'WF-04', id: '8q9tF3VE0mLUZQfa', file: 'storywf04.json', name: 'storywf04' },
  { key: 'WF-05', id: 'ADPseu4KBfVveYrq', file: 'storywf05.json', name: 'storywf05' },
  { key: 'WF-06', id: 'WAB7tCTJSUilOp07', file: 'storywf06.json', name: 'storywf06' },
  { key: 'WF-07', id: 'zvw63UrbObZhFUiW', file: 'Storywf07.json', name: 'Storywf07' },
  { key: 'WF-08', id: 'MrWrz58aRUVTzpLr', file: 'Storywf08.json', name: 'Storywf08' },
  { key: 'WF-09', id: 'gT1c0Hpvrwyf9YS6', file: 'storywf09.json', name: 'storywf09' },
  { key: 'WF-10', id: 'swOEbQV3iNUNmMwu', file: 'StoryWf10.json', name: 'StoryWf10' },
  { key: 'WF-11', id: 'baRqhI9JSob9m5oD', file: 'Storywf11.json', name: 'Storywf11' },
  { key: 'WF-12', id: '2fcuca0HkGxGIYMv', file: 'StoryWf12.json', name: 'StoryWf12' },
  { key: 'WF-13', id: 'jI39p4vr4CnWhpgw', file: 'storywf13.json', name: 'storywf13' },
] as const;

export function findAnimeWorkflow(key: string): AnimeWorkflowEntry | undefined {
  return ANIME_WORKFLOW_REGISTRY.find((entry) => entry.key === key);
}
