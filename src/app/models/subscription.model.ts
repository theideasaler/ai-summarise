export interface SubscriptionTier {
  id: 'free' | 'pro';
  name: string;
  price: number;
  tokens: number;
  maxRequests: number;
  features: string[];
}

export interface SubscriptionStatus {
  tier: 'free' | 'pro';
  status: 'active' | 'inactive' | 'canceled' | 'past_due';
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface CheckoutSessionRequest {
  tier: 'pro';
  success_url: string;
  cancel_url: string;
}

export interface CheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
  customer_id: string;
  tier: 'pro';
}

export interface PortalSessionResponse {
  portal_url: string;
  session_id: string;
  customer_id: string;
  portal_enabled?: boolean;
  action?: string;
}

export interface SubscriptionStatusResponse {
  user_id: string;
  subscription_tier: 'free' | 'pro';
  subscription_status: 'active' | 'inactive' | 'canceled' | 'past_due';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  subscription_details?: {
    id: string;
    status: string;
    tier: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    canceled_at?: string;
    price_id: string;
  };
  token_usage: {
    monthly_limit: number;
    tokens_used: number;
    tokens_reserved: number;
    remaining_tokens: number;
    next_reset_date: string;
  };
  last_updated: string;
}

export interface StripeError {
  error: string;
  message: string;
  statusCode?: number;
  errorCode?: string;
  portalEnabled?: boolean;
}

export interface StripeConfig {
  publishableKey: string;
  products: {
    pro: {
      priceId: string;
    };
  };
  redirectOrigins?: string[];
}
