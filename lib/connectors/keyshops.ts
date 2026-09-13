import type { ConnectorInput, StoreResult } from './types';

export async function getEnebaResult(
  _input: ConnectorInput,
): Promise<StoreResult> {
  if (!process.env.ENEBA_CLIENT_ID || !process.env.ENEBA_CLIENT_SECRET) {
    return {
      store: 'Eneba',
      status: 'not-integrated',
      diagnostic:
        'Eneba exige credenciais/feed aprovado para preço final ao consumidor.',
    };
  }
  return {
    store: 'Eneba',
    status: 'not-integrated',
    diagnostic:
      'Credenciais configuradas, mas conector de preço final ainda não homologado.',
  };
}

export async function getKinguinResult(
  _input: ConnectorInput,
): Promise<StoreResult> {
  if (!process.env.KINGUIN_API_KEY) {
    return {
      store: 'Kinguin',
      status: 'not-integrated',
      diagnostic:
        'Kinguin exige fonte aprovada; API seller não é preço final de consumidor.',
    };
  }
  return {
    store: 'Kinguin',
    status: 'not-integrated',
    diagnostic:
      'Chave configurada, mas conector de preço final ainda não homologado.',
  };
}
