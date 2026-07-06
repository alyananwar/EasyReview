import twilio from "twilio";

export interface SmsSender {
  send(toPhone: string, message: string): Promise<string | undefined>;
  close(): Promise<void>;
}

export async function createTwilioSender(): Promise<SmsSender> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      "Missing Twilio config. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in your environment.",
    );
  }

  const client = twilio(accountSid, authToken);

  return {
    async send(toPhone: string, message: string): Promise<string | undefined> {
      const result = await client.messages.create({
        body: message,
        from: fromNumber,
        to: `+1${toPhone}`,
      });
      return result.sid;
    },
    async close() {
      // No-op: REST client, nothing to close.
    },
  };
}
