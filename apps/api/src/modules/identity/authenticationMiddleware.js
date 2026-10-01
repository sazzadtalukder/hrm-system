import { AuthenticationError } from '../../common/errors/ApplicationError.js';

export function createAuthenticationMiddleware({ tokenService, identityRepository }) {
  return async function authenticate(request, _response, next) {
    try {
      const authorization = request.get('authorization');
      if (!authorization?.startsWith('Bearer ')) throw new AuthenticationError();
      const payload = await tokenService.verifyAccessToken(authorization.slice(7));
      const session = await identityRepository.findSessionWithUser(payload.sid);
      const now = new Date();
      if (
        !session ||
        String(session.user_id) !== payload.sub ||
        session.user_status !== 'active' ||
        session.revoked_at ||
        new Date(session.expires_at) <= now ||
        Number(session.auth_version) !== Number(payload.auth_version)
      ) {
        throw new AuthenticationError('The session is no longer valid.');
      }
      request.actor = {
        userId: session.user_id,
        sessionId: session.session_id,
        email: session.email,
        authVersion: session.auth_version,
      };
      next();
    } catch (error) {
      next(error instanceof AuthenticationError ? error : new AuthenticationError());
    }
  };
}
