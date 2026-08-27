/**
 * services/simulation/scenarioGenerator.ts — Indian Payment Failure Scenario Generator
 *
 * Generates highly realistic payment failure payloads mirroring Indian payment gateway dynamics:
 * 1. SALARY_CYCLE_DROP (Soft decline: INSUFFICIENT_FUNDS, occurring end-of-month)
 * 2. MIDNIGHT_BANK_MAINTENANCE (HDFC / SBI / ICICI switch downtime between 00:00–03:30 IST)
 * 3. INTENT_DROP_CHECKOUT (OTP timeout / UPI drop-off)
 * 4. MANDATE_AUTOPAY_FAILURE (E-mandate recurring subscription failure)
 * 5. HARD_DECLINE (Card expired or stolen)
 */

import { DeclineCategory } from "@revrec/types";

export interface SyntheticPaymentFailure {
  externalPaymentId: string;
  externalCustomerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerRiskScore: number;
  customerLtvInPaise: number;
  amountInPaise: number;
  currency: string;
  paymentMethod: string;
  gateway: string;
  gatewayErrorCode: string;
  declineCategory: DeclineCategory;
  failedAt: Date;
  scenarioType: "SALARY_CYCLE_DROP" | "BANK_MAINTENANCE" | "INTENT_DROP" | "MANDATE_FAILURE" | "HARD_DECLINE";
}

const INDIAN_NAMES = [
  "Aarav Sharma", "Priya Patel", "Rohan Verma", "Ananya Iyer", "Vikram Malhotra",
  "Neha Gupta", "Kavita Nair", "Rajesh Kumar", "Siddharth Sen", "Meera Reddy",
  "Aditya Chopra", "Pooja Joshi", "Varun Mehta", "Divya Menon", "Karan Singhal",
];

const SOFT_CODES = ["INSUFFICIENT_FUNDS", "EXCEEDS_BALANCE", "DAILY_LIMIT_EXCEEDED"];
const NETWORK_CODES = ["UPI_SWITCH_DOWN", "GATEWAY_TIMEOUT", "BANK_UNAVAILABLE", "NPCI_TIMEOUT"];
const INTENT_CODES = ["OTP_TIMED_OUT", "USER_DROPPED_OFF", "USER_CANCELLED", "SESSION_EXPIRED"];
const MANDATE_CODES = ["MANDATE_EXECUTION_FAILED", "PRE_DEBIT_NOTIFICATION_FAILED", "MANDATE_NOT_ACTIVE"];
const HARD_CODES = ["CARD_EXPIRED", "STOLEN_CARD", "ACCOUNT_CLOSED", "INVALID_CARD_NUMBER"];

/**
 * Generates a random failure scenario.
 */
export function generateRandomFailure(index: number = 0): SyntheticPaymentFailure {
  const rand = Math.random();
  const name = INDIAN_NAMES[index % INDIAN_NAMES.length]!;
  const extId = `cust_synth_${Date.now().toString(36)}_${index}`;
  const phone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}@example.in`;

  if (rand < 0.40) {
    // 40% Soft Declines (Salary cycle / Liquidity)
    const code = SOFT_CODES[Math.floor(Math.random() * SOFT_CODES.length)]!;
    return {
      externalPaymentId: `pay_soft_${Date.now().toString(36)}_${index}`,
      externalCustomerId: extId,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      customerRiskScore: Math.floor(15 + Math.random() * 45),
      customerLtvInPaise: Math.floor(3000000 + Math.random() * 8000000), // ₹30,000 - ₹80,000
      amountInPaise: Math.floor(99900 + Math.random() * 400000), // ₹999 - ₹4,999
      currency: "INR",
      paymentMethod: "upi",
      gateway: "razorpay",
      gatewayErrorCode: code,
      declineCategory: DeclineCategory.SOFT,
      failedAt: new Date(Date.now() - Math.floor(Math.random() * 3600 * 1000)),
      scenarioType: "SALARY_CYCLE_DROP",
    };
  } else if (rand < 0.65) {
    // 25% Network / Bank Switch Downtime
    const code = NETWORK_CODES[Math.floor(Math.random() * NETWORK_CODES.length)]!;
    return {
      externalPaymentId: `pay_net_${Date.now().toString(36)}_${index}`,
      externalCustomerId: extId,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      customerRiskScore: Math.floor(10 + Math.random() * 30),
      customerLtvInPaise: Math.floor(5000000 + Math.random() * 12000000),
      amountInPaise: Math.floor(150000 + Math.random() * 1000000), // ₹1,500 - ₹11,500
      currency: "INR",
      paymentMethod: "upi",
      gateway: "razorpay",
      gatewayErrorCode: code,
      declineCategory: DeclineCategory.NETWORK,
      failedAt: new Date(),
      scenarioType: "BANK_MAINTENANCE",
    };
  } else if (rand < 0.80) {
    // 15% Intent Drops (OTP friction / UPI drop)
    const code = INTENT_CODES[Math.floor(Math.random() * INTENT_CODES.length)]!;
    return {
      externalPaymentId: `pay_intent_${Date.now().toString(36)}_${index}`,
      externalCustomerId: extId,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      customerRiskScore: Math.floor(20 + Math.random() * 40),
      customerLtvInPaise: Math.floor(2000000 + Math.random() * 5000000),
      amountInPaise: Math.floor(49900 + Math.random() * 250000), // ₹499 - ₹2,999
      currency: "INR",
      paymentMethod: "upi",
      gateway: "razorpay",
      gatewayErrorCode: code,
      declineCategory: DeclineCategory.INTENT_DROP,
      failedAt: new Date(),
      scenarioType: "INTENT_DROP",
    };
  } else if (rand < 0.92) {
    // 12% Mandate Recurring Subscription Failures
    const code = MANDATE_CODES[Math.floor(Math.random() * MANDATE_CODES.length)]!;
    return {
      externalPaymentId: `pay_mandate_${Date.now().toString(36)}_${index}`,
      externalCustomerId: extId,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      customerRiskScore: Math.floor(15 + Math.random() * 35),
      customerLtvInPaise: Math.floor(8000000 + Math.random() * 20000000),
      amountInPaise: Math.floor(299900 + Math.random() * 1500000),
      currency: "INR",
      paymentMethod: "netbanking",
      gateway: "razorpay",
      gatewayErrorCode: code,
      declineCategory: DeclineCategory.MANDATE_FAILURE,
      failedAt: new Date(),
      scenarioType: "MANDATE_FAILURE",
    };
  } else {
    // 8% Hard Declines (Expired / Stolen)
    const code = HARD_CODES[Math.floor(Math.random() * HARD_CODES.length)]!;
    return {
      externalPaymentId: `pay_hard_${Date.now().toString(36)}_${index}`,
      externalCustomerId: extId,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      customerRiskScore: Math.floor(70 + Math.random() * 25),
      customerLtvInPaise: Math.floor(500000 + Math.random() * 1500000),
      amountInPaise: Math.floor(199900 + Math.random() * 300000),
      currency: "INR",
      paymentMethod: "card",
      gateway: "razorpay",
      gatewayErrorCode: code,
      declineCategory: DeclineCategory.HARD,
      failedAt: new Date(),
      scenarioType: "HARD_DECLINE",
    };
  }
}

/**
 * Generates a batch of N realistic failure scenarios.
 */
export function generateBatchScenarios(count: number = 50): SyntheticPaymentFailure[] {
  return Array.from({ length: count }, (_, i) => generateRandomFailure(i));
}
