import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ITEM_ID_REGEX } from '../CommunityPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

const mockFetchItems = vi.fn().mockResolvedValue([]);
const mockFetchAllTags = vi.fn().mockResolvedValue([]);
const mockGetUserRole = vi.fn().mockResolvedValue('regular');
const mockFetchItemById = vi.fn();

vi.mock('../communityApi', () => ({
  fetchItems: (...args: unknown[]) => mockFetchItems(...args),
  fetchAllTags: (...args: unknown[]) => mockFetchAllTags(...args),
  getUserRole: (...args: unknown[]) => mockGetUserRole(...args),
  fetchItemById: (...args: unknown[]) => mockFetchItemById(...args),
  getThumbnailUrl: (p: string) => `https://cdn.example.com/${p}`,
  downloadItem: vi.fn(),
  rateItem: vi.fn(),
  getUserRating: vi.fn().mockResolvedValue(null),
  deleteItem: vi.fn(),
  semverGt: vi.fn().mockReturnValue(false),
}));

vi.mock('../../state/pluginStore', () => ({
  usePluginStore: (sel: (s: { plugins: Record<string, unknown> }) => unknown) =>
    sel({ plugins: {} }),
}));

vi.mock('@core/scene/plugins', () => ({
  loadPlugin: vi.fn(),
  upgradePlugin: vi.fn(),
  unloadPlugin: vi.fn(),
  satisfiesVersion: vi.fn().mockReturnValue(true),
  PLUGIN_API_VERSION: '1.0.0',
}));

vi.mock('@persistence/validate', () => ({ CURRENT_SCHEMA_VERSION: 1 }));
vi.mock('../../package.json', () => ({ default: { version: '1.0.0' } }));
vi.mock('../../utils/importPayloadStorage', () => ({ writeStoredImportPayload: vi.fn() }));

// Lazy import after mocks are set up
async function renderPage(path: string) {
  const { default: CommunityPage } = await import('../CommunityPage');
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CommunityPage />
    </MemoryRouter>,
  );
}

const VALID_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const SAMPLE_ITEM = {
  id: VALID_ID,
  user_id: 'user-1',
  type: 'plugin' as const,
  title: 'Awesome Plugin',
  description: 'A test plugin',
  thumbnail_path: 'thumb.png',
  file_path: 'file.mvmnt-plugin',
  file_size_bytes: 1024,
  downloads_count: 42,
  average_rating: 4.5,
  ratings_count: 10,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  plugin_uid: 'awesome-plugin',
  version: '1.0.0',
  uploader_username: 'alice',
  tags: [],
  plugin_api_version: null,
  template_schema_version: null,
  min_app_version: null,
};

// ── ITEM_ID_REGEX unit tests ───────────────────────────────────────────────────

describe('ITEM_ID_REGEX', () => {
  it('accepts a valid lowercase UUID', () => {
    expect(ITEM_ID_REGEX.test('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('accepts a valid uppercase UUID', () => {
    expect(ITEM_ID_REGEX.test('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
  });

  it('rejects a too-short string', () => {
    expect(ITEM_ID_REGEX.test('abc')).toBe(false);
  });

  it('rejects a string with script injection characters', () => {
    expect(ITEM_ID_REGEX.test('<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a UUID with wrong segment lengths', () => {
    expect(ITEM_ID_REGEX.test('a1b2c3d4-e5f6-7890-abcd-ef123456789')).toBe(false);
  });
});

// ── CommunityPage deep-link behaviour ─────────────────────────────────────────

describe('CommunityPage deep link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchItems.mockResolvedValue([]);
    mockFetchAllTags.mockResolvedValue([]);
  });

  it('renders normally with no ?id param', async () => {
    await renderPage('/community');
    await waitFor(() => expect(screen.getByText('Community')).toBeInTheDocument());
    expect(mockFetchItemById).not.toHaveBeenCalled();
    expect(screen.queryByText('Plugin not found')).toBeNull();
  });

  it('auto-opens detail modal for a valid, found ID', async () => {
    mockFetchItemById.mockResolvedValue(SAMPLE_ITEM);
    await renderPage(`/community?id=${VALID_ID}`);
    await waitFor(() => expect(screen.getByText('Awesome Plugin')).toBeInTheDocument());
    expect(mockFetchItemById).toHaveBeenCalledWith(VALID_ID);
  });

  it('shows "Plugin not found" when the item does not exist', async () => {
    mockFetchItemById.mockResolvedValue(null);
    await renderPage(`/community?id=${VALID_ID}`);
    await waitFor(() => expect(screen.getByText('Plugin not found')).toBeInTheDocument());
  });

  it('shows "Plugin not found" and skips fetch for an invalid (non-UUID) id', async () => {
    await renderPage('/community?id=not-a-uuid!!');
    await waitFor(() => expect(screen.getByText('Plugin not found')).toBeInTheDocument());
    expect(mockFetchItemById).not.toHaveBeenCalled();
  });

  it('shows "Plugin not found" when fetchItemById rejects', async () => {
    mockFetchItemById.mockRejectedValue(new Error('network error'));
    await renderPage(`/community?id=${VALID_ID}`);
    await waitFor(() => expect(screen.getByText('Plugin not found')).toBeInTheDocument());
  });

  it('dismisses the error banner when the X button is clicked', async () => {
    mockFetchItemById.mockResolvedValue(null);
    await renderPage(`/community?id=${VALID_ID}`);
    await waitFor(() => expect(screen.getByText('Plugin not found')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Plugin not found')).toBeNull();
  });
});

// ── Share button ──────────────────────────────────────────────────────────────

describe('Share button', () => {
  it('copies /community?id=<id> to clipboard and shows "Copied!"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://example.com', pathname: '/community' },
      writable: true,
      configurable: true,
    });

    mockFetchItemById.mockResolvedValue(SAMPLE_ITEM);
    await renderPage(`/community?id=${VALID_ID}`);
    await waitFor(() => expect(screen.getByText('Awesome Plugin')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /copy share link/i }));

    expect(writeText).toHaveBeenCalledWith(`https://example.com/community?id=${VALID_ID}`);
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
  });
});
