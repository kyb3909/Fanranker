import { BetaAnalyticsDataClient } from "@google-analytics/data"

let client: BetaAnalyticsDataClient | null = null

export function getClient(): BetaAnalyticsDataClient {
  if (client) return client

  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !privateKey) {
    throw new Error("GA4_SERVICE_ACCOUNT_EMAIL and GA4_SERVICE_ACCOUNT_PRIVATE_KEY must be set")
  }

  client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: email,
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
  })

  return client
}

export function getPropertyId(): string {
  const propertyId = process.env.GA4_PROPERTY_ID
  if (!propertyId) {
    throw new Error("GA4_PROPERTY_ID must be set")
  }
  return propertyId
}
