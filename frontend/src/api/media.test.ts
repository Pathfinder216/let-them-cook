import { uploadRecipeCover, uploadStepMedia, fetchStepMedia } from './media';

describe('media api', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    document.cookie = 'kc_csrf=tok123';
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'm1', type: 'image', path: '/media/x.jpg' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  // Regression: uploads used to be raw fetches with no CSRF header, so every photo
  // attached while saving a recipe was rejected with 403 and silently dropped.
  it('sends the CSRF token and session cookies with a cover photo upload', async () => {
    const file = new File(['x'], 'cover.jpg', { type: 'image/jpeg' });
    await uploadRecipeCover('r1', file);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/recipes/r1/media');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['x-csrf-token']).toBe('tok123');
    // The browser must set the multipart boundary itself.
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(file);
  });

  it('sends the CSRF token with a step media upload', async () => {
    await uploadStepMedia('s1', new File(['x'], 'step.jpg', { type: 'image/jpeg' }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/steps/s1/media');
    expect(init.headers['x-csrf-token']).toBe('tok123');
  });

  it('throws when an upload is rejected instead of failing silently', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid csrf token' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(uploadStepMedia('s1', new File(['x'], 'step.jpg'))).rejects.toThrow(
      'invalid csrf token',
    );
  });

  it('returns null for a step with no media', async () => {
    fetchMock.mockResolvedValue(
      new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    await expect(fetchStepMedia('s1')).resolves.toBeNull();
  });
});
