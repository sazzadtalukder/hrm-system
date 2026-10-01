export function sendSuccess(response, data, statusCode = 200) {
  return response
    .status(statusCode)
    .json({ success: true, data, requestId: response.locals.requestId });
}
