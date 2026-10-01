import { sendSuccess } from '../../common/http/responses.js';
import { clearRefreshCookieOptions, parseCookies, refreshCookieOptions } from './cookies.js';

function noStore(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

export function createAuthController({
  authService,
  authorizationService,
  passwordSetupService,
  env,
}) {
  function setRefreshCookie(response, token) {
    response.cookie(env.REFRESH_COOKIE_NAME, token, refreshCookieOptions(env));
  }

  return {
    async login(request, response, next) {
      try {
        const result = await authService.login({
          ...request.validated.body,
          ip: request.ip,
          userAgent: request.get('user-agent'),
          requestContext: request.context,
        });
        setRefreshCookie(response, result.refreshToken);
        noStore(response);
        sendSuccess(response, {
          accessToken: result.accessToken,
          expiresIn: result.expiresIn,
        });
      } catch (error) {
        next(error);
      }
    },
    async refresh(request, response, next) {
      try {
        const rawToken = parseCookies(request)[env.REFRESH_COOKIE_NAME];
        const result = await authService.refresh({ rawToken, requestContext: request.context });
        setRefreshCookie(response, result.refreshToken);
        noStore(response);
        sendSuccess(response, { accessToken: result.accessToken, expiresIn: result.expiresIn });
      } catch (error) {
        response.clearCookie(env.REFRESH_COOKIE_NAME, clearRefreshCookieOptions(env));
        next(error);
      }
    },
    async logout(request, response, next) {
      try {
        const rawToken = parseCookies(request)[env.REFRESH_COOKIE_NAME];
        await authService.revokeSession({ rawToken, requestContext: request.context });
        response.clearCookie(env.REFRESH_COOKIE_NAME, clearRefreshCookieOptions(env));
        noStore(response);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
    async logoutAll(request, response, next) {
      try {
        await authService.revokeAll({
          userId: request.actor.userId,
          requestContext: request.context,
        });
        response.clearCookie(env.REFRESH_COOKIE_NAME, clearRefreshCookieOptions(env));
        noStore(response);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
    async me(request, response, next) {
      try {
        const [permissions, permissionScopes] = await Promise.all([
          authorizationService.listPermissionCodes(request.actor.userId),
          authorizationService.listNavigationScopes(request.actor.userId),
        ]);
        noStore(response);
        sendSuccess(response, {
          user: { id: request.actor.userId, email: request.actor.email },
          permissions,
          permissionScopes,
        });
      } catch (error) {
        next(error);
      }
    },
    async changePassword(request, response, next) {
      try {
        await authService.changePassword({
          userId: request.actor.userId,
          ...request.validated.body,
          requestContext: request.context,
        });
        response.clearCookie(env.REFRESH_COOKIE_NAME, clearRefreshCookieOptions(env));
        noStore(response);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
    async validatePasswordSetup(request, response, next) {
      try {
        noStore(response);
        sendSuccess(response, await passwordSetupService.validate(request.validated.body.token));
      } catch (error) {
        next(error);
      }
    },
    async completePasswordSetup(request, response, next) {
      try {
        await passwordSetupService.complete({
          rawToken: request.validated.body.token,
          newPassword: request.validated.body.newPassword,
          requestContext: request.context,
        });
        noStore(response);
        response.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  };
}
