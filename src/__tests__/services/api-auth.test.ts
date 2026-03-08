import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase/auth before importing the module under test
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
}));

import { getAuth } from 'firebase/auth';
import { getAuthToken, authHeaders } from '../../services/api-auth';

const mockGetAuth = vi.mocked(getAuth);

describe('getAuthToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no user is logged in', async () => {
    mockGetAuth.mockReturnValue({ currentUser: null } as ReturnType<typeof getAuth>);
    const token = await getAuthToken();
    expect(token).toBeNull();
  });

  it('returns token from currentUser.getIdToken()', async () => {
    mockGetAuth.mockReturnValue({
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue('test-jwt-token'),
      },
    } as unknown as ReturnType<typeof getAuth>);

    const token = await getAuthToken();
    expect(token).toBe('test-jwt-token');
  });

  it('returns null when getIdToken throws', async () => {
    mockGetAuth.mockReturnValue({
      currentUser: {
        getIdToken: vi.fn().mockRejectedValue(new Error('token error')),
      },
    } as unknown as ReturnType<typeof getAuth>);

    const token = await getAuthToken();
    expect(token).toBeNull();
  });
});

describe('authHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes Authorization header when user is logged in', async () => {
    mockGetAuth.mockReturnValue({
      currentUser: {
        getIdToken: vi.fn().mockResolvedValue('my-token'),
      },
    } as unknown as ReturnType<typeof getAuth>);

    const headers = await authHeaders({ 'Content-Type': 'application/json' });
    expect(headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer my-token',
    });
  });

  it('omits Authorization header when no user is logged in', async () => {
    mockGetAuth.mockReturnValue({ currentUser: null } as ReturnType<typeof getAuth>);

    const headers = await authHeaders({ 'Content-Type': 'application/json' });
    expect(headers).toEqual({
      'Content-Type': 'application/json',
    });
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('returns empty headers object when no extra headers and no user', async () => {
    mockGetAuth.mockReturnValue({ currentUser: null } as ReturnType<typeof getAuth>);

    const headers = await authHeaders();
    expect(headers).toEqual({});
  });
});
