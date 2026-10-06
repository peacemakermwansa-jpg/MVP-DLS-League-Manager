export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailProviderConfig = {
  provider: string;
  from: string;
  apiKey: string;
  apiUrl: string;
  publicUrl: string;
};

export type EmailDeliveryResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" };

/**
 * Configuration boundary for the future verification/reset email provider.
 * No delivery is attempted until a provider adapter is deliberately added.
 */
export function getEmailProviderConfig(env: NodeJS.ProcessEnv = process.env): EmailProviderConfig {
  return {
    provider: env.EMAIL_PROVIDER?.trim() ?? "",
    from: env.EMAIL_FROM?.trim() ?? "",
    apiKey: env.EMAIL_API_KEY?.trim() ?? "",
    apiUrl: env.EMAIL_API_URL?.trim() ?? "",
    publicUrl: env.APP_PUBLIC_URL?.trim() ?? "",
  };
}

export function isEmailProviderConfigured(config = getEmailProviderConfig()) {
  return Boolean(config.provider && config.from && config.apiKey && config.publicUrl);
}

export async function sendTransactionalEmail(_message: TransactionalEmail, config = getEmailProviderConfig()): Promise<EmailDeliveryResult> {
  if (!isEmailProviderConfigured(config)) return { sent: false, reason: "not_configured" };
  throw new Error(`Email provider adapter is not implemented for ${config.provider}. Configure an explicit provider adapter before enabling delivery.`);
}
