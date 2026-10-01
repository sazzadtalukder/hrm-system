export function requirePermission(authorizationService, permission) {
  return async (request, _response, next) => {
    try {
      request.accessContext = await authorizationService.requirePermission(
        request.actor,
        permission,
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}
