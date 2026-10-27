import { randomUUID } from 'node:crypto';
import {
  STREAM_IN_USE_REASON,
  STREAM_LEASE_TTL_SECONDS,
  listSessionsResponseSchema,
  streamHeartbeatResponseSchema,
  videoPlaybackResponseSchema,
} from '@opencourse/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { settings, streamLeases, videoAssets } from '../src/db/schema';
import { loadPlatformSettings } from '../src/modules/settings/service';
import { createCast, insertCourse, insertGrant, insertLesson, insertModule } from './fixtures';
import { createTestApp, resetDatabase, STRONG_PASSWORD, TestClient, type TestApp } from './helpers';

describe('one stream per account', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  /** A ready encrypted video in a course the student has a grant for. */
  async function setup() {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'published',
    });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const lesson = await insertLesson(ctx.app, courseModule.id, 0, {
      title: 'Video lesson',
      type: 'video',
    });
    const assetId = randomUUID();
    await ctx.app.db.insert(videoAssets).values({
      id: assetId,
      lessonId: lesson.id,
      sizeBytes: 1000,
      status: 'ready',
      durationSeconds: 60,
    });
    await ctx.app.storage.putText(
      `videos/${assetId}/hls/key.bin`,
      '00112233445566778899aabbccddeeff',
      'text/plain',
    );
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.admin.userId,
    });
    return { cast, course, assetId };
  }

  /** The same account on another device: a new browser that signs in. */
  async function secondDevice(email = 'sam@example.com') {
    const client = new TestClient(ctx.app);
    const response = await client.post('/api/v1/auth/login', { email, password: STRONG_PASSWORD });
    expect(response.statusCode).toBe(200);
    return client;
  }

  /** What the player does when a lesson opens: ask for an address and keep its key route. */
  async function openVideo(client: TestClient, assetId: string) {
    const response = await client.get(`/api/v1/videos/${assetId}/playback`);
    expect(response.statusCode).toBe(200);
    const { playbackUrl } = videoPlaybackResponseSchema.parse(response.json());
    const token = new URL(playbackUrl, 'http://localhost').searchParams.get('token')!;
    return `/api/v1/videos/${assetId}/key?token=${encodeURIComponent(token)}`;
  }

  async function heartbeat(
    client: TestClient,
    assetId: string,
    event: 'play' | 'beat' | 'check' | 'stop',
  ) {
    const response = await client.post(`/api/v1/videos/${assetId}/heartbeat`, { event });
    expect(response.statusCode).toBe(200);
    return streamHeartbeatResponseSchema.parse(response.json()).active;
  }

  const getKey = (url: string) => ctx.app.inject({ method: 'GET', url });

  it('lets the newest play win and pauses the device it took over from', async () => {
    const { cast, assetId } = await setup();
    const laptop = cast.student.client;
    const phone = await secondDevice();
    const laptopKey = await openVideo(laptop, assetId);
    const phoneKey = await openVideo(phone, assetId);

    expect(await heartbeat(laptop, assetId, 'play')).toBe(true);
    expect(await heartbeat(laptop, assetId, 'beat')).toBe(true);
    expect((await getKey(laptopKey)).statusCode).toBe(200);
    // the second device cannot get the key while the first one plays
    const refused = await getKey(phoneKey);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.details).toEqual({ reason: STREAM_IN_USE_REASON });

    // pressing play on the phone takes the stream over
    expect(await heartbeat(phone, assetId, 'play')).toBe(true);
    expect((await getKey(phoneKey)).statusCode).toBe(200);
    expect(await heartbeat(laptop, assetId, 'beat')).toBe(false);
    expect((await getKey(laptopKey)).statusCode).toBe(409);
    // a beat of the loser does not steal it back
    expect(await heartbeat(phone, assetId, 'beat')).toBe(true);
  });

  it('lets a beat claim the stream only when nobody holds it', async () => {
    const { cast, assetId } = await setup();
    const phone = await secondDevice();

    // nobody plays: the first beat takes the stream
    expect(await heartbeat(cast.student.client, assetId, 'beat')).toBe(true);
    expect(await heartbeat(phone, assetId, 'beat')).toBe(false);

    // the holder stopped beating, so the lease expires and the other device may take it
    await ctx.app.db
      .update(streamLeases)
      .set({ lastBeatAt: new Date(Date.now() - (STREAM_LEASE_TTL_SECONDS + 1) * 1000) });
    const phoneKey = await openVideo(phone, assetId);
    expect((await getKey(phoneKey)).statusCode).toBe(200);
    expect(await heartbeat(phone, assetId, 'beat')).toBe(true);
  });

  it('frees the stream when the playing session is ended from "My sessions"', async () => {
    const { cast, assetId } = await setup();
    const phone = await secondDevice();
    const phoneKey = await openVideo(phone, assetId);
    await heartbeat(cast.student.client, assetId, 'play');
    expect((await getKey(phoneKey)).statusCode).toBe(409);

    const listed = listSessionsResponseSchema.parse(
      (await phone.get('/api/v1/me/sessions')).json(),
    );
    const laptopSession = listed.sessions.find((session) => !session.current)!;
    expect((await phone.delete(`/api/v1/me/sessions/${laptopSession.id}`)).statusCode).toBe(204);

    expect((await getKey(phoneKey)).statusCode).toBe(200);
    expect(await heartbeat(phone, assetId, 'beat')).toBe(true);
  });

  it('does not apply to the instructor of the course', async () => {
    const { cast, assetId } = await setup();
    const other = await secondDevice('ines@example.com');
    const firstKey = await openVideo(cast.instructorA.client, assetId);
    const otherKey = await openVideo(other, assetId);

    expect(await heartbeat(cast.instructorA.client, assetId, 'play')).toBe(true);
    expect(await heartbeat(other, assetId, 'play')).toBe(true);
    expect(await heartbeat(cast.instructorA.client, assetId, 'beat')).toBe(true);
    expect((await getKey(firstKey)).statusCode).toBe(200);
    expect((await getKey(otherKey)).statusCode).toBe(200);
  });

  it('frees the stream on stop, and a check only asks without taking it', async () => {
    const { cast, assetId } = await setup();
    const phone = await secondDevice();
    const phoneKey = await openVideo(phone, assetId);

    // nobody plays: a check answers yes and does not take the stream
    expect(await heartbeat(phone, assetId, 'check')).toBe(true);
    expect(await ctx.app.db.select().from(streamLeases)).toHaveLength(0);

    await heartbeat(cast.student.client, assetId, 'play');
    expect(await heartbeat(phone, assetId, 'check')).toBe(false);
    expect((await getKey(phoneKey)).statusCode).toBe(409);

    // pausing frees it at once; a stop from the device that does not hold it changes nothing
    expect(await heartbeat(phone, assetId, 'stop')).toBe(true);
    expect((await getKey(phoneKey)).statusCode).toBe(409);
    expect(await heartbeat(cast.student.client, assetId, 'stop')).toBe(true);
    expect((await getKey(phoneKey)).statusCode).toBe(200);
  });

  it('stops a device from watching once it is signed out', async () => {
    const { cast, assetId } = await setup();
    const phone = await secondDevice();
    const phoneKey = await openVideo(phone, assetId);
    expect((await getKey(phoneKey)).statusCode).toBe(200);

    const listed = listSessionsResponseSchema.parse(
      (await cast.student.client.get('/api/v1/me/sessions')).json(),
    );
    const phoneSession = listed.sessions.find((session) => !session.current)!;
    expect(
      (await cast.student.client.delete(`/api/v1/me/sessions/${phoneSession.id}`)).statusCode,
    ).toBe(204);
    expect((await getKey(phoneKey)).statusCode).toBe(401);
  });

  it('keeps the stored one-stream setting when a patch leaves it out', async () => {
    const { cast } = await setup();
    const patch = (video: object) => cast.admin.client.patch('/api/v1/admin/settings', { video });
    expect((await patch({ singleStreamEnabled: false })).statusCode).toBe(200);
    const saved = await patch({ watermarkEnabled: true });
    expect(saved.json().video).toMatchObject({
      watermarkEnabled: true,
      singleStreamEnabled: false,
    });
  });

  it('does nothing while the platform setting is off', async () => {
    const { cast, assetId } = await setup();
    const phone = await secondDevice();
    const phoneKey = await openVideo(phone, assetId);
    await heartbeat(cast.student.client, assetId, 'play');
    expect((await getKey(phoneKey)).statusCode).toBe(409);

    const saved = await cast.admin.client.patch('/api/v1/admin/settings', {
      video: { singleStreamEnabled: false },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().video).toEqual({
      watermarkEnabled: false,
      singleStreamEnabled: false,
      enabledVideoProviders: ['youtube', 'vimeo'],
    });
    expect((await getKey(phoneKey)).statusCode).toBe(200);
    expect(await heartbeat(phone, assetId, 'beat')).toBe(true);
    expect(await heartbeat(cast.student.client, assetId, 'beat')).toBe(true);
  });

  it('lets the video play when the lease cannot be read', async () => {
    const { cast, assetId } = await setup();
    const phone = await secondDevice();
    const phoneKey = await openVideo(phone, assetId);
    await heartbeat(cast.student.client, assetId, 'play');
    expect((await getKey(phoneKey)).statusCode).toBe(409);

    await ctx.app.db.execute(sql`alter table stream_leases rename to stream_leases_away`);
    try {
      expect((await getKey(phoneKey)).statusCode).toBe(200);
      expect(await heartbeat(phone, assetId, 'play')).toBe(true);
      expect(await heartbeat(phone, assetId, 'beat')).toBe(true);
    } finally {
      await ctx.app.db.execute(sql`alter table stream_leases_away rename to stream_leases`);
    }
  });

  it('requires a session and access to the course to report playback', async () => {
    const { cast, assetId } = await setup();
    const anonymous = new TestClient(ctx.app);
    expect(
      (await anonymous.post(`/api/v1/videos/${assetId}/heartbeat`, { event: 'beat' })).statusCode,
    ).toBe(401);
    expect(
      (
        await cast.otherStudent.client.post(`/api/v1/videos/${assetId}/heartbeat`, {
          event: 'beat',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await cast.student.client.post(`/api/v1/videos/${randomUUID()}/heartbeat`, {
          event: 'beat',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await cast.student.client.post(`/api/v1/videos/${assetId}/heartbeat`, { event: 'rewind' }))
        .statusCode,
    ).toBe(400);
  });

  it('turns settings saved before the option existed into the default of one stream', async () => {
    await ctx.app.db.insert(settings).values({
      key: 'platform',
      value: {
        brand: { name: 'Old', logoUrl: null, primaryColor: '#2f6f5e' },
        enabledLocales: ['pt-BR'],
        defaultLocale: 'pt-BR',
        email: { host: 'h', port: 25, username: '', fromAddress: 'a@b.co', secure: false },
        video: { watermarkEnabled: true },
      },
    });
    const loaded = await loadPlatformSettings(ctx.app.db, ctx.config);
    // an upgrade keeps the platform usable: the default providers are on until an admin changes them
    expect(loaded.video).toEqual({
      watermarkEnabled: true,
      singleStreamEnabled: true,
      enabledVideoProviders: ['youtube', 'vimeo'],
    });
  });
});

describe('my sessions', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  it('lists the live sessions of the user, marks the current one and ends only their own', async () => {
    const cast = await createCast(ctx.app);
    const phone = new TestClient(ctx.app);
    await phone.request('POST', '/api/v1/auth/login', {
      body: { email: 'sam@example.com', password: STRONG_PASSWORD },
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone) Safari' },
    });

    const listed = listSessionsResponseSchema.parse(
      (await phone.get('/api/v1/me/sessions')).json(),
    );
    expect(listed.sessions).toHaveLength(2);
    expect(listed.sessions.filter((session) => session.current)).toHaveLength(1);
    const current = listed.sessions.find((session) => session.current)!;
    expect(current.userAgent).toContain('iPhone');
    const laptop = listed.sessions.find((session) => !session.current)!;

    // another user's session is not there to end, and looks the same as an unknown one
    const stranger = listSessionsResponseSchema.parse(
      (await cast.otherStudent.client.get('/api/v1/me/sessions')).json(),
    );
    expect((await phone.delete(`/api/v1/me/sessions/${stranger.sessions[0]!.id}`)).statusCode).toBe(
      404,
    );
    expect((await phone.delete(`/api/v1/me/sessions/${randomUUID()}`)).statusCode).toBe(404);

    expect((await phone.delete(`/api/v1/me/sessions/${laptop.id}`)).statusCode).toBe(204);
    expect((await cast.student.client.get('/api/v1/me')).statusCode).toBe(401);
    // ending it twice is a 404, and the list no longer shows it
    expect((await phone.delete(`/api/v1/me/sessions/${laptop.id}`)).statusCode).toBe(404);
    expect(
      listSessionsResponseSchema.parse((await phone.get('/api/v1/me/sessions')).json()).sessions,
    ).toHaveLength(1);

    // ending the current session signs this browser out
    expect((await phone.delete(`/api/v1/me/sessions/${current.id}`)).statusCode).toBe(204);
    expect((await phone.get('/api/v1/me')).statusCode).toBe(401);
  });
});
