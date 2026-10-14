import 'server-only';

const BUFFER_API_URL = 'https://api.buffer.com';

export type BufferMode = 'test' | 'draft' | 'queue';

type BufferGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type BufferOrganization = { id: string; name: string };
type BufferBoard = { id: string; name: string; serviceId: string; url: string };
type BufferChannel = {
  id: string;
  name: string;
  displayName?: string | null;
  service: string;
  isDisconnected: boolean;
  isLocked: boolean;
  isQueuePaused: boolean;
  metadata?: { boards?: BufferBoard[] } | null;
};

export type BufferPinterestTarget = {
  organizationId: string;
  organizationName: string;
  channelId: string;
  channelName: string;
  channelIsQueuePaused: boolean;
  boardId: string;
  boardServiceId: string;
  boardName: string;
  boardUrl: string;
};

export type BufferPostResult = { id: string; status: string; dueAt: string | null };

export function bufferMode(): BufferMode {
  const value = (process.env.BUFFER_MODE || 'test').trim().toLowerCase();
  if (value === 'test' || value === 'draft' || value === 'queue') return value;
  throw new Error('BUFFER_MODE must be test, draft, or queue.');
}

async function bufferGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) throw new Error('BUFFER_API_KEY is missing from the server environment.');

  const response = await fetch(BUFFER_API_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Buffer authentication failed. Check the API key in Netlify and confirm it has not expired.');
  }
  if (!response.ok) {
    throw new Error(`Buffer API request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json() as BufferGraphQLResponse<T>;
  if (payload.errors?.length) {
    const message = payload.errors.map((e) => e.message || 'Unknown GraphQL error').join('; ');
    throw new Error(`Buffer API error: ${message.slice(0, 600)}`);
  }
  if (!payload.data) throw new Error('Buffer API returned no data. Check the key and API permissions.');
  return payload.data;
}

/** Read-only discovery of the first connected Pinterest channel and one of its boards. */
export async function getBufferPinterestTarget(preferredBoardServiceId?: string | null): Promise<BufferPinterestTarget> {
  const organizationsResult = await bufferGraphQL<{ account?: { organizations?: BufferOrganization[] } }>(`
    query GetOrganizations {
      account {
        organizations { id name }
      }
    }
  `);

  let organizations = organizationsResult.account?.organizations || [];
  const preferredOrganizationId = process.env.BUFFER_ORGANIZATION_ID?.trim();
  if (preferredOrganizationId) organizations = organizations.filter((org) => org.id === preferredOrganizationId);
  if (!organizations.length) {
    throw new Error(preferredOrganizationId
      ? 'The configured BUFFER_ORGANIZATION_ID was not found in this Buffer account.'
      : 'No Buffer organization was found for this API key.');
  }

  const preferredChannelId = process.env.BUFFER_CHANNEL_ID?.trim();
  const preferredBoard = process.env.BUFFER_BOARD_SERVICE_ID?.trim() || preferredBoardServiceId?.trim() || '';

  const channelsQuery = `
    query GetChannels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId }) {
        id
        name
        displayName
        service
        isDisconnected
        isLocked
        isQueuePaused
        metadata {
          ... on PinterestMetadata {
            boards { id name serviceId url }
          }
        }
      }
    }
  `;

  for (const organization of organizations) {
    const data = await bufferGraphQL<{ channels?: BufferChannel[] }>(channelsQuery, { organizationId: organization.id });
    const channels = data.channels || [];
    const pinterestChannels = channels.filter((channel) => channel.service.toLowerCase() === 'pinterest');
    const matching = (preferredChannelId
      ? pinterestChannels.filter((channel) => channel.id === preferredChannelId)
      : pinterestChannels
    ).filter((channel) => !channel.isDisconnected && !channel.isLocked);

    for (const channel of matching) {
      const boards = channel.metadata?.boards || [];
      const board = (preferredBoard ? boards.find((candidate) => candidate.serviceId === preferredBoard) : undefined) || boards[0];
      if (!board) continue;
      return {
        organizationId: organization.id,
        organizationName: organization.name,
        channelId: channel.id,
        channelName: channel.displayName || channel.name,
        channelIsQueuePaused: channel.isQueuePaused,
        boardId: board.id,
        boardServiceId: board.serviceId,
        boardName: board.name,
        boardUrl: board.url,
      };
    }
  }

  throw new Error(preferredChannelId
    ? 'The configured Buffer channel is not a connected Pinterest channel with an available board.'
    : 'No connected Pinterest channel with an available board was found in Buffer. Connect your Pinterest account in Buffer and try again.');
}

export async function createBufferPinterestPost(input: {
  target: BufferPinterestTarget;
  title: string;
  description: string;
  imageUrl: string;
  destinationUrl?: string | null;
  mode: Exclude<BufferMode, 'test'>;
}): Promise<BufferPostResult> {
  if (!input.imageUrl.startsWith('https://')) throw new Error('Pin image must use a public HTTPS URL.');
  if (input.mode === 'queue' && input.target.channelIsQueuePaused) {
    throw new Error('The Pinterest channel queue is paused in Buffer. Resume it in Buffer before queue mode can schedule Pins.');
  }

  const metadata: Record<string, unknown> = {
    pinterest: {
      boardServiceId: input.target.boardServiceId,
      title: input.title.slice(0, 100),
      ...(input.destinationUrl ? { url: input.destinationUrl } : {}),
    },
  };

  const mutation = `
    mutation CreatePinterestPost($input: CreatePostInput!) {
      createPost(input: $input) {
        __typename
        ... on PostActionSuccess {
          post { id status dueAt }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const inputPayload = {
    text: input.description.slice(0, 800),
    channelId: input.target.channelId,
    schedulingType: 'automatic',
    mode: 'addToQueue',
    saveToDraft: input.mode === 'draft',
    assets: [{ image: { url: input.imageUrl } }],
    metadata,
  };

  const data = await bufferGraphQL<{
    createPost?:
      | { __typename: 'PostActionSuccess'; post?: { id: string; status: string; dueAt?: string | null } }
      | { __typename: 'MutationError'; message?: string };
  }>(mutation, { input: inputPayload });

  const result = data.createPost;
  if (!result) throw new Error('Buffer API did not return a createPost result.');
  if (result.__typename === 'MutationError') throw new Error(`Buffer could not create the Pin: ${result.message || 'Unknown mutation error.'}`);
  if (!result.post?.id) throw new Error('Buffer accepted the request but returned no post ID.');

  return { id: result.post.id, status: result.post.status || (input.mode === 'draft' ? 'draft' : 'scheduled'), dueAt: result.post.dueAt || null };
}
