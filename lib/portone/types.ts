/**
 * PortOne v2 API response types
 *
 * @see https://developers.portone.io/api/rest-v2
 */

export interface PortOnePayment {
  id: string
  transactionId?: string
  status: "READY" | "PAID" | "VIRTUAL_ACCOUNT_ISSUED" | "PARTIAL_CANCELLED" | "CANCELLED" | "FAILED"
  amount: {
    total: number
    taxFree: number
    vat: number
    supply: number
    discount: number
    paid: number
    cancelled: number
    cancelledTaxFree: number
  }
  currency: string
  method?: {
    type: string
    card?: {
      number: string
      issuer?: string
      acquirer?: string
      installment?: { month: number }
    }
    easyPay?: { provider: string }
  }
  channel?: {
    pgProvider: string
    pgMerchantId: string
  }
  requestedAt: string
  paidAt?: string
  cancelledAt?: string
  failedAt?: string
  receiptUrl?: string
  pgTxId?: string
  orderName?: string
  customer?: {
    name?: string
    email?: string
    phoneNumber?: string
  }
}

export interface PortOneBillingKey {
  billingKey: string
  pgProvider: string
  issuedAt: string
  methods?: Array<{
    type: string
    card?: {
      number: string
      issuer?: string
    }
  }>
}

export interface PortOneError {
  type: string
  message: string
}

export interface PortOnePreRegisterResponse {
  // Pre-register returns empty body on success (200 OK)
}

export interface PortOneCancelResponse {
  cancellation: {
    id: string
    totalAmount: number
    taxFreeAmount: number
    reason: string
    cancelledAt: string
  }
}
