import {
  acceptInviteRequestSchema,
  createInviteRequestSchema,
  createInviteResponseSchema,
  inviteResponseSchema,
  listInvitesQuerySchema,
  listInvitesResponseSchema,
  sessionResponseSchema,
} from '@opencourse/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { hashPassword } from '../../auth/passwords';
import { generateToken, hashToken } from '../../auth/tokens';
import type { Config } from '../../config';
import { courses, invites, users, type InviteRow } from '../../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../../errors';
import { inviteEmail } from '../../mail/templates';
import { effectiveInviteStatus, toLocale, toPublicInvite, toPublicUser } from '../../mappers';
import { createUser } from '../../users/create-user';
import { resolveCourseAccess } from '../courses/access';

const DEFAULT_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ACCEPT_LIMIT = { max: 10, timeWindow: '1 minute' };
const LOOKUP_LIMIT = { max: 30, timeWindow: '1 minute' };

const tokenParamsSchema = z.object({ token: z.string().min(1).max(256) });

export const inviteRoutes: FastifyPluginAsyncZod<{ config: Config }> = async (app, { config }) => {
  /** Finds an invite by its secret token and requires it to still be usable. */
  async function findPendingInvite(token: string, now: Date): Promise<InviteRow> {
    const [invite] = await app.db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, hashToken(token)));
    if (!invite) throw notFound('Invite not found');
    const status = effectiveInviteStatus(invite, now);
    if (status !== 'pending') throw conflict(`Invite is ${status}`);
    return invite;
  }

  app.post(
    '/invites',
    {
      preHandler: app.requireRole('admin', 'instructor'),
      schema: {
        tags: ['invites'],
        summary: 'Invite someone by e-mail',
        description: 'The acceptance link is returned only here and sent to the invitee.',
        body: createInviteRequestSchema,
        response: { 201: createInviteResponseSchema },
      },
    },
    async (request, reply) => {
      const inviter = request.auth!.user;
      const { email, courseId } = request.body;
      const now = new Date();
      const expiresAt = request.body.expiresAt
        ? new Date(request.body.expiresAt)
        : new Date(now.getTime() + DEFAULT_INVITE_TTL_MS);
      if (expiresAt <= now) throw badRequest('Invite expiry must be in the future');

      if (courseId) {
        const [course] = await app.db.select().from(courses).where(eq(courses.id, courseId));
        if (!course) throw notFound('Course not found');
        // same rule as editing the course: invisible -> 404, visible but not theirs -> 403
        const access = await resolveCourseAccess(app.db, inviter, course, now);
        if (!access.isVisible) throw notFound('Course not found');
        if (!access.canManage) throw forbidden('Only the course instructor or an admin can invite');
      }

      const [existing] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email));
      if (existing) throw conflict('Email already registered');

      const token = generateToken();
      const [invite] = await app.db
        .insert(invites)
        .values({
          email,
          courseId: courseId ?? null,
          tokenHash: hashToken(token),
          createdById: inviter.id,
          expiresAt,
        })
        .returning();
      if (!invite) throw new Error('Failed to create invite');

      const acceptUrl = `${config.WEB_BASE_URL}/invite/${encodeURIComponent(token)}`;
      app.sendMailInBackground({
        to: email,
        // the invitee has no account yet, so the inviter language is the best guess
        ...inviteEmail(toLocale(inviter.locale), inviter.name, acceptUrl),
      });
      return reply.code(201).send({ invite: toPublicInvite(invite, now), acceptUrl });
    },
  );

  app.get(
    '/invites',
    {
      preHandler: app.requireRole('admin', 'instructor'),
      schema: {
        tags: ['invites'],
        summary: 'List invites',
        description: 'Admins see every invite; instructors see the ones they created.',
        querystring: listInvitesQuerySchema,
        response: { 200: listInvitesResponseSchema },
      },
    },
    async (request) => {
      const { user } = request.auth!;
      const rows = await app.db
        .select()
        .from(invites)
        .where(
          and(
            user.role === 'admin' ? undefined : eq(invites.createdById, user.id),
            request.query.courseId ? eq(invites.courseId, request.query.courseId) : undefined,
          ),
        )
        .orderBy(desc(invites.createdAt));
      const now = new Date();
      return { invites: rows.map((row) => toPublicInvite(row, now)) };
    },
  );

  app.get(
    '/invites/:token',
    {
      config: { rateLimit: LOOKUP_LIMIT },
      schema: {
        tags: ['invites'],
        summary: 'Look up a pending invite by its token',
        params: tokenParamsSchema,
        response: { 200: inviteResponseSchema },
      },
    },
    async (request) => {
      const now = new Date();
      return { invite: toPublicInvite(await findPendingInvite(request.params.token, now), now) };
    },
  );

  app.post(
    '/invites/:token/accept',
    {
      config: { rateLimit: ACCEPT_LIMIT },
      schema: {
        tags: ['invites'],
        summary: 'Accept an invite: creates the account and starts a session',
        params: tokenParamsSchema,
        body: acceptInviteRequestSchema,
        response: { 201: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      const now = new Date();
      const invite = await findPendingInvite(request.params.token, now);
      // slow on purpose, so it runs before the transaction takes a connection and a row lock
      const passwordHash = await hashPassword(request.body.password);

      // one transaction: claiming the invite and creating the account succeed or fail together,
      // so a duplicate e-mail never burns the invite and two concurrent accepts cannot both win
      const user = await app.db.transaction(async (tx) => {
        const claimed = await tx
          .update(invites)
          .set({ status: 'accepted', acceptedAt: now })
          .where(and(eq(invites.id, invite.id), eq(invites.status, 'pending')))
          .returning({ id: invites.id });
        if (claimed.length === 0) throw conflict('Invite is no longer pending');

        return createUser(tx, {
          name: request.body.name,
          email: invite.email,
          passwordHash,
          locale: request.body.locale,
          timeZone: request.body.timeZone,
          promoteFirstUserToAdmin: false,
        });
      });

      await app.startSession(request, reply, user);
      return reply.code(201).send({ user: toPublicUser(user) });
    },
  );
};
