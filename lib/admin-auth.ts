export function authorizeAdmin(
  request: Request,
  token = process.env.SAFELOOT_ADMIN_TOKEN,
) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!token?.trim())
    return Response.json(
      { error: 'Rotina administrativa não configurada.' },
      { status: 503, headers },
    );
  const provided = request.headers.get('authorization') || '';
  const expected = `Bearer ${token}`;
  let difference = provided.length ^ expected.length;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ (provided.charCodeAt(i) || 0);
  return difference
    ? Response.json({ error: 'Não autorizado.' }, { status: 401, headers })
    : null;
}
